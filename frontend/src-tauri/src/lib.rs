use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager, State};

// --- VEC Infinity 3 USB Identifiers ---
const VEC_VENDOR_ID: u16 = 0x05f3;
const VEC_PRODUCT_ID: u16 = 0x00ff;

// --- Shared State to track pedal connection ---
#[derive(Default)]
struct PedalConnectionState(Arc<Mutex<bool>>);

// --- Tauri Command for the frontend to query the state ---
#[tauri::command]
fn is_pedal_connected(state: State<'_, PedalConnectionState>) -> bool {
    *state.0.lock().unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PedalConnectionState::default()) // Add the state to Tauri
        .invoke_handler(tauri::generate_handler![is_pedal_connected]) // Register the command
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<PedalConnectionState>();
            let state_clone = state.0.clone();

            // Spawn a background thread to handle HID communication
            thread::spawn(move || {
                loop {
                    if let Ok(api) = hidapi::HidApi::new() {
                        if let Some(device_info) = api.device_list().find(|d| {
                            d.vendor_id() == VEC_VENDOR_ID && d.product_id() == VEC_PRODUCT_ID
                        }) {
                            println!("VEC Infinity 3 pedal found!");
                            // Update shared state and emit event
                            *state_clone.lock().unwrap() = true;
                            let _ = handle.emit("pedal-found", true);

                            if let Ok(device) = device_info.open_device(&api) {
                                poll_pedal(&device, &handle);
                                // If poll_pedal exits, it means the pedal was disconnected
                                *state_clone.lock().unwrap() = false;
                                let _ = handle.emit("pedal-disconnected", true);
                                println!("Pedal disconnected. Will try to reconnect...");
                            }
                        }
                    }
                    thread::sleep(Duration::from_secs(5));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// This function runs in a loop, reading the pedal's state and emitting events
fn poll_pedal(device: &hidapi::HidDevice, handle: &tauri::AppHandle) {
    let mut last_state = 0u8;
    let mut buf = [0u8; 8]; // Buffer to read HID report

    loop {
        match device.read_timeout(&mut buf, 100) {
            Ok(_) => {
                let current_state = buf[0];
                if current_state != last_state {
                    // 1 = Left, 2 = Center, 4 = Right
                    if (current_state & 1) != (last_state & 1) {
                        let event = if (current_state & 1) > 0 {
                            "left-pressed"
                        } else {
                            "left-released"
                        };
                        let _ = handle.emit("pedal-action", event);
                    }
                    if (current_state & 2) != (last_state & 2) {
                        let event = if (current_state & 2) > 0 {
                            "center-pressed"
                        } else {
                            "center-released"
                        };
                        let _ = handle.emit("pedal-action", event);
                    }
                    if (current_state & 4) != (last_state & 4) {
                        let event = if (current_state & 4) > 0 {
                            "right-pressed"
                        } else {
                            "right-released"
                        };
                        let _ = handle.emit("pedal-action", event);
                    }
                    println!("Pedal state changed to: {}", current_state);
                    last_state = current_state;
                }
            }
            Err(e) => {
                eprintln!("Error reading from HID device: {}. Assuming disconnect.", e);
                break; // Exit the polling loop to allow reconnection
            }
        }
    }
}
