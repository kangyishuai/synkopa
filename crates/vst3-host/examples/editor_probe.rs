//! Opens a VST3 plugin's editor the way the app does, and reports every step.
//!
//! `cargo run -p wave-vst3 --example editor_probe -- <name substring> [seconds]`
//!
//! Scans the installed plugins (effects and instruments), hosts the first one whose name
//! contains the substring, opens its editor from the UI thread through the window service,
//! and pumps window messages for a few seconds (default 6) while printing whether the editor
//! is still open. A diagnostic for "the plugin GUI button does nothing".

#[cfg(windows)]
fn main() {
    use std::time::{Duration, Instant};
    use windows_sys::Win32::UI::WindowsAndMessaging::{DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE};

    if wave_vst3::run_scan_worker_if_requested() {
        return;
    }
    let mut args = std::env::args().skip(1);
    let want = args.next().expect("usage: editor_probe <plugin name substring> [seconds]").to_lowercase();
    let secs: u64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(6);

    // the UI thread is this one: jobs posted to it run in the message loop below
    let (tx, rx) = std::sync::mpsc::channel::<wave_vst3::MainThreadJob>();
    let tx = std::sync::Mutex::new(tx);
    wave_vst3::set_main_thread_executor(move |job| {
        let _ = tx.lock().unwrap().send(job);
    });
    let windows = wave_plugin_windows::Service::new();

    let mut all = wave_vst3::scan(false);
    let inst = wave_vst3::scan_instruments(false);
    all.extend(inst.iter().cloned());
    let Some(info) = all.iter().find(|p| p.name.to_lowercase().contains(&want)) else {
        eprintln!("no installed VST3 named like {want:?}; found: {:?}", all.iter().map(|p| &p.name).collect::<Vec<_>>());
        return;
    };
    let is_inst = inst.iter().any(|p| p.cid == info.cid);
    println!("hosting {} ({}) instrument={is_inst} path={}", info.name, info.cid, info.path);
    let t = Instant::now();
    let handle = if is_inst {
        wave_vst3::instantiate_instrument(&info.path, &info.cid, None, 48_000.0, 512, false).map(|x| x.1)
    } else {
        wave_vst3::instantiate(&info.path, &info.cid, None, 48_000.0, 512).map(|x| x.1)
    };
    let handle = match handle {
        Ok(h) => h,
        Err(e) => return eprintln!("instantiate failed: {e}"),
    };
    println!("instantiated in {:?}; has_editor={}", t.elapsed(), handle.has_editor());
    let t = Instant::now();
    match handle.open_editor(&windows) {
        Ok(()) => println!("open_editor: ok in {:?}; is_editor_open={}", t.elapsed(), handle.is_editor_open()),
        Err(e) => println!("open_editor: ERROR {e} (after {:?})", t.elapsed()),
    }
    let end = Instant::now() + Duration::from_secs(secs);
    let mut last = Instant::now();
    while Instant::now() < end {
        while let Ok(job) = rx.try_recv() {
            job();
        }
        unsafe {
            let mut msg: MSG = std::mem::zeroed();
            while PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        if last.elapsed() > Duration::from_secs(1) {
            println!("  editor open: {}", handle.is_editor_open());
            last = Instant::now();
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    let _ = handle.close_editor();
    println!("closed");
}

#[cfg(not(windows))]
fn main() {
    eprintln!("editor_probe pumps Win32 messages; it runs on Windows only");
}
