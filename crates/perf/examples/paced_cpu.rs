//! Real-time paced playback: what the engine costs the machine, not only the callback.
//!
//!   cargo run --release -p wave-perf --example paced_cpu -- <project.wave|empty> <block> <threads> <play|stop> [secs]
//!
//! `wave-perf bench` times `Rt::process` blocks rendered back to back, which says how close the
//! callback is to its deadline but nothing about the audio worker threads: a worker that spins
//! while it waits for work costs a core without showing up there. This renders at the device's
//! pace (sleeping between blocks like a callback would) and reports the process's CPU time from
//! `/proc` (Linux), per thread, next to the callback load. `threads` as `Engine::set_render_workers`
//! (1 = the callback thread only).

use std::sync::Arc;
use std::time::{Duration, Instant};
use wave_engine::*;

const SR: f64 = 48000.0;

/// utime + stime of a `/proc/.../stat` line, in seconds.
fn stat_cpu(stat: &str) -> Option<f64> {
    let f: Vec<&str> = stat.rsplit(')').next()?.split_whitespace().collect();
    Some((f.get(11)?.parse::<f64>().ok()? + f.get(12)?.parse::<f64>().ok()?) / 100.0)
}

/// The process's CPU time, or None where `/proc` is not there (macOS, Windows).
fn process_cpu() -> Option<f64> {
    std::fs::read_to_string("/proc/self/stat").ok().and_then(|s| stat_cpu(&s))
}

fn threads_cpu() -> Vec<(String, f64)> {
    let Ok(dir) = std::fs::read_dir("/proc/self/task") else {
        return vec![];
    };
    dir.flatten()
        .filter_map(|d| {
            let p = d.path();
            let name = std::fs::read_to_string(p.join("comm")).ok()?.trim().to_string();
            Some((name, stat_cpu(&std::fs::read_to_string(p.join("stat")).ok()?)?))
        })
        .collect()
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    if a.len() < 4 {
        eprintln!("usage: paced_cpu <project.wave|empty> <block> <threads> <play|stop> [secs]");
        std::process::exit(2);
    }
    let (proj, play) = (&a[0], a[3] == "play");
    let block: usize = a[1].parse().expect("block");
    let threads: usize = a[2].parse().expect("threads");
    let secs: f64 = a.get(4).and_then(|s| s.parse().ok()).unwrap_or(6.0);

    let e = Engine::new(Project::routed(), Arc::new(NoPlugins));
    if proj != "empty" {
        e.open(std::path::Path::new(proj)).expect("open project");
    }
    e.set_render_workers(threads);
    let mut rt = e.create_rt(SR as f32, block);
    if play {
        e.play(if proj == "empty" { 0.0 } else { e.project().song_end() * 0.3 });
    }
    let (mut l, mut r) = (vec![0f32; block], vec![0f32; block]);
    let period = Duration::from_secs_f64(block as f64 / SR);
    // warm-up: applies the queued commands and runs the render path once, so first-use work
    // (graph build, lazy buffers) is not measured; then the workers get time to park
    for _ in 0..(0.5 * SR / block as f64) as usize {
        rt.process(&mut l, &mut r, None);
    }
    std::thread::sleep(Duration::from_millis(300));

    let before = threads_cpu();
    let Some(c0) = process_cpu() else {
        eprintln!("paced_cpu: process CPU time needs /proc (Linux); not available on this host");
        std::process::exit(2);
    };
    let t0 = Instant::now();
    let mut next = t0;
    let mut loads = Vec::with_capacity((secs / period.as_secs_f64()) as usize + 1);
    while t0.elapsed().as_secs_f64() < secs {
        let tb = Instant::now();
        rt.process(&mut l, &mut r, None);
        loads.push(tb.elapsed().as_secs_f64() / period.as_secs_f64() * 100.0);
        next += period;
        let now = Instant::now();
        if next > now {
            std::thread::sleep(next - now);
        } else {
            next = now;
        }
    }
    let wall = t0.elapsed().as_secs_f64();
    let cpu = (process_cpu().unwrap_or(c0) - c0) / wall * 100.0;
    let mut per: Vec<String> = threads_cpu()
        .iter()
        .filter_map(|(n, t)| {
            let b = before.iter().find(|(m, _)| m == n).map_or(0.0, |x| x.1);
            let pct = (t - b) / wall * 100.0;
            (pct > 0.5).then(|| format!("{n}={pct:.0}%"))
        })
        .collect();
    per.sort();
    loads.sort_by(f64::total_cmp);
    let mean = loads.iter().sum::<f64>() / loads.len().max(1) as f64;
    let p99 = loads.get(loads.len() * 99 / 100).copied().unwrap_or(0.0);
    let late = loads.iter().filter(|&&x| x > 100.0).count();
    println!(
        "block {block} threads {threads} {}: process CPU {cpu:.1}% of a core, callback load mean {mean:.1}% p99 {p99:.1}%, late {late} [{}]",
        if play { "play" } else { "stop" },
        per.join(" ")
    );
}
