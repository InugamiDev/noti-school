use noti_school_api::{AppState, config::Config};
use std::time::Duration;

fn main() {
    let args: Vec<_> = std::env::args_os().collect();
    if args.get(1).is_some_and(|a| a == "--extract-pdf") {
        if args.len() != 4
            || noti_school_api::pdf::extract_child(
                std::path::Path::new(&args[2]),
                std::path::Path::new(&args[3]),
            )
            .is_err()
        {
            std::process::exit(1);
        }
        return;
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("runtime");
    if runtime.block_on(run()).is_err() {
        eprintln!("noti-school-api: startup or runtime failure (details redacted)");
        std::process::exit(1);
    }
}
async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::load().map_err(|_| "invalid API configuration")?;
    let state = AppState::new(config).map_err(|_| "API initialization failed")?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3810").await?;
    let (stop_tx, stop_rx) = tokio::sync::oneshot::channel::<()>();
    let server =
        axum::serve(listener, noti_school_api::router(state)).with_graceful_shutdown(async {
            let _ = stop_rx.await;
        });
    let task = tokio::spawn(async move { server.await });
    let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    tokio::select! { _=tokio::signal::ctrl_c()=>{}, _=term.recv()=>{} }
    let _ = stop_tx.send(());
    let _ = tokio::time::timeout(Duration::from_secs(14), task).await;
    Ok(())
}
