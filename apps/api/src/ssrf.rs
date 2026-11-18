use crate::error::{Error, Result};
use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};
pub fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            !(v.is_private()
                || v.is_loopback()
                || v.is_link_local()
                || v.is_broadcast()
                || v.is_documentation()
                || v.is_unspecified()
                || v.is_multicast()
                || o[0] == 0
                || o[0] >= 224
                || (o[0] == 100 && (64..=127).contains(&o[1]))
                || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
                || (o[0] == 192 && o[1] == 0)
                // Deprecated 6to4 relay anycast (RFC 7526) is not globally reachable.
                || (o[0] == 192 && o[1] == 88 && o[2] == 99))
        }
        IpAddr::V6(v) => {
            let o = v.segments();
            v.to_ipv4_mapped().is_none()
                && o[0] & 0xe000 == 0x2000
                && o[0] != 0x2002
                && !(o[0] == 0x3fff && o[1] & 0xf000 == 0)
                && !(o[0] == 0x2001 && (o[1] < 0x200 || o[1] == 0xdb8))
        }
    }
}
pub fn validate_url(raw: &str, allow: &[String]) -> Result<url::Url> {
    let u = url::Url::parse(raw).map_err(crate::error::invalid)?;
    let host = u.host_str().ok_or(Error("invalid_request"))?;
    if u.scheme() != "https"
        || !u.username().is_empty()
        || u.password().is_some()
        || u.fragment().is_some()
        || u.port().is_some_and(|p| p != 443)
        || host.parse::<IpAddr>().is_ok()
        || host.starts_with('[')
        || !allow.iter().any(|d| d == host)
    {
        return Err(Error("forbidden"));
    }
    Ok(u)
}
// intent: web evidence URLs are fetched remotely by TinyFish, but a page is only usable when its
// (final) URL is https on a public DNS name; this keeps private/intranet hosts out of evidence.
pub fn web_url(raw: &str) -> Result<url::Url> {
    let mut u = url::Url::parse(raw).map_err(crate::error::invalid)?;
    u.set_fragment(None);
    let host = u
        .host_str()
        .ok_or(Error("forbidden"))?
        .trim_end_matches('.')
        .to_owned();
    if u.scheme() != "https"
        || raw.len() > 2048
        || !u.username().is_empty()
        || u.password().is_some()
        || u.port().is_some_and(|p| p != 443)
        || !matches!(u.host(), Some(url::Host::Domain(_)))
        || !host.contains('.')
        || [
            "localhost",
            ".local",
            ".internal",
            ".lan",
            ".home.arpa",
            ".localhost",
            ".onion",
        ]
        .iter()
        .any(|suffix| host == suffix.trim_start_matches('.') || host.ends_with(suffix))
    {
        return Err(Error("forbidden"));
    }
    Ok(u)
}
#[cfg(test)]
pub(crate) static TEST_HOSTS: std::sync::Mutex<Vec<(String, IpAddr)>> =
    std::sync::Mutex::new(Vec::new());
// Every resolved address must be globally routable. Resolution failure is not public.
pub async fn public_host(host: &str) -> Result<()> {
    #[cfg(test)]
    {
        let fixtures: Vec<IpAddr> = TEST_HOSTS
            .lock()
            .unwrap()
            .iter()
            .filter(|(h, _)| h == host)
            .map(|(_, ip)| *ip)
            .collect();
        return if !fixtures.is_empty() && fixtures.iter().all(|ip| public_ip(*ip)) {
            Ok(())
        } else {
            Err(Error("forbidden"))
        };
    }
    #[allow(unreachable_code)]
    {
        let addresses: Vec<SocketAddr> =
            tokio::time::timeout(Duration::from_secs(3), tokio::net::lookup_host((host, 443)))
                .await
                .map_err(|_| Error("forbidden"))?
                .map_err(|_| Error("forbidden"))?
                .collect();
        if addresses.is_empty() || addresses.iter().any(|a| !public_ip(a.ip())) {
            return Err(Error("forbidden"));
        }
        Ok(())
    }
}
fn connected_address(remote: Option<SocketAddr>, pinned: &[SocketAddr]) -> Result<()> {
    if remote.is_none_or(|a| !public_ip(a.ip()) || !pinned.iter().any(|p| p.ip() == a.ip())) {
        return Err(Error("forbidden"));
    }
    Ok(())
}
// intent: validate every redirect and pin the socket resolver; no environment proxy or second DNS lookup.
pub async fn fetch(raw: &str, allow: &[String]) -> Result<(String, Vec<u8>)> {
    tokio::time::timeout(Duration::from_secs(15), async {
        let mut url = validate_url(raw, allow)?;
        for hop in 0..=3 {
            let host = url.host_str().ok_or(Error("invalid_request"))?.to_owned();
            let addresses: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 443))
                .await
                .map_err(|_| Error("provider_unavailable"))?
                .collect();
            if addresses.is_empty() || addresses.iter().any(|a| !public_ip(a.ip())) {
                return Err(Error("forbidden"));
            }
            let client = reqwest::Client::builder()
                .no_proxy()
                .retry(reqwest::retry::never())
                .redirect(reqwest::redirect::Policy::none())
                .resolve_to_addrs(&host, &addresses)
                .timeout(Duration::from_secs(15))
                .build()
                .map_err(|_| Error("core_unavailable"))?;
            let response = client
                .get(url.clone())
                .send()
                .await
                .map_err(|_| Error("provider_unavailable"))?;
            connected_address(response.remote_addr(), &addresses)?;
            if response.status().is_redirection() {
                if hop == 3 {
                    return Err(Error("invalid_request"));
                }
                let loc = response
                    .headers()
                    .get("location")
                    .and_then(|v| v.to_str().ok())
                    .ok_or(Error("invalid_request"))?;
                url = validate_url(
                    url.join(loc).map_err(crate::error::invalid)?.as_str(),
                    allow,
                )?;
                continue;
            }
            if !response.status().is_success() {
                return Err(Error("provider_unavailable"));
            }
            let mime = response
                .headers()
                .get("content-type")
                .and_then(|h| h.to_str().ok())
                .unwrap_or("")
                .split(';')
                .next()
                .unwrap_or("")
                .trim()
                .to_owned();
            if !["application/pdf", "text/plain", "text/html"].contains(&mime.as_str()) {
                return Err(Error("unsupported_media"));
            }
            let limit = if mime == "application/pdf" {
                20 * 1024 * 1024
            } else {
                2 * 1024 * 1024
            };
            return Ok((mime, crate::http::limited_body(response, limit).await?));
        }
        Err(Error("invalid_request"))
    })
    .await
    .map_err(|_| Error("provider_unavailable"))?
}
pub async fn allowed_hosts(s: &crate::AppState, institution: uuid::Uuid) -> Result<Vec<String>> {
    let slug: Option<String> =
        sqlx::query_scalar("SELECT slug FROM product.institutions WHERE id=$1")
            .bind(institution)
            .fetch_optional(s.pool()?)
            .await?;
    Ok(if slug.as_deref() == Some("hcmiu") {
        vec!["edusoftweb.hcmiu.edu.vn".into()]
    } else {
        vec![]
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn web_evidence_urls_are_https_public_dns_names() {
        assert_eq!(
            web_url("https://www.example.edu/a#frag").unwrap().as_str(),
            "https://www.example.edu/a"
        );
        for bad in [
            "http://www.example.edu/a",
            "https://127.0.0.1/a",
            "https://[::1]/a",
            "https://user:pw@www.example.edu/",
            "https://www.example.edu:8443/",
            "https://localhost/",
            "https://printer.local/",
            "https://db.internal/",
            "https://intranet/",
            "ftp://www.example.edu/",
        ] {
            assert!(web_url(bad).is_err(), "{bad}");
        }
        TEST_HOSTS.lock().unwrap().extend([
            (
                "public.example.edu".into(),
                "93.184.216.34".parse().unwrap(),
            ),
            ("private.example.edu".into(), "192.168.1.5".parse().unwrap()),
            ("mixed.example.edu".into(), "93.184.216.34".parse().unwrap()),
            (
                "mixed.example.edu".into(),
                "169.254.169.254".parse().unwrap(),
            ),
        ]);
        assert!(public_host("public.example.edu").await.is_ok());
        for host in [
            "private.example.edu",
            "mixed.example.edu",
            "unresolved.example.edu",
        ] {
            assert!(public_host(host).await.is_err(), "{host}");
        }
    }
    #[tokio::test]
    async fn actual_connected_socket_and_redirect_denied() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            axum::serve(
                listener,
                axum::Router::new().route("/", axum::routing::get(|| async { "synthetic" })),
            )
            .await
            .unwrap()
        });
        let response = reqwest::Client::builder()
            .no_proxy()
            .retry(reqwest::retry::never())
            .build()
            .unwrap()
            .get(format!("http://{addr}/"))
            .send()
            .await
            .unwrap();
        assert!(connected_address(response.remote_addr(), &[addr]).is_err());
        assert!(
            connected_address(
                Some("8.8.8.8:443".parse().unwrap()),
                &["1.1.1.1:443".parse().unwrap()]
            )
            .is_err()
        );
        let allowed = vec!["edusoftweb.hcmiu.edu.vn".into()];
        let base = validate_url("https://edusoftweb.hcmiu.edu.vn/policy.pdf", &allowed).unwrap();
        for redirect in [
            "http://edusoftweb.hcmiu.edu.vn/a",
            "https://169.254.169.254/latest/meta-data",
            "https://127.0.0.1/x",
            "https://evil.example/a",
            "https://sub.edusoftweb.hcmiu.edu.vn/a",
        ] {
            assert!(validate_url(base.join(redirect).unwrap().as_str(), &allowed).is_err());
        }
        assert!(fetch("https://127.0.0.1/a", &allowed).await.is_err());
        task.abort();
        let _ = task.await;
    }
}
