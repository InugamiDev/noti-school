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
                || (o[0] == 192 && o[1] == 0))
        }
        IpAddr::V6(v) => {
            let o = v.segments();
            v.to_ipv4_mapped().is_none()
                && o[0] & 0xe000 == 0x2000
                && o[0] != 0x2002
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
// intent: validate every redirect and pin the socket resolver; no environment proxy or second DNS lookup.
pub async fn fetch(raw: &str, allow: &[String]) -> Result<Vec<u8>> {
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
            if response
                .remote_addr()
                .is_none_or(|a| !public_ip(a.ip()) || !addresses.iter().any(|p| p.ip() == a.ip()))
            {
                return Err(Error("forbidden"));
            }
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
            return crate::http::limited_body(response, 20 * 1024 * 1024).await;
        }
        Err(Error("invalid_request"))
    })
    .await
    .map_err(|_| Error("provider_unavailable"))?
}
