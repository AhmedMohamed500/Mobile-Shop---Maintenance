# Printing

Receipt and device-label jobs are persisted during intake. Their payloads contain shop-safe operational data and the tracking URL; labels deliberately exclude unlock credentials. Failure updates the job and permits a permission-controlled retry without recreating the repair.

`PrinterAdapter` isolates hardware access from React and the API workflow. The Tauri desktop bridge will claim local jobs, render the tenant template for 58/80 mm receipt or configured label dimensions, print, and report completion/failure. The current slice queues real jobs but does not claim a physical printer is connected.
