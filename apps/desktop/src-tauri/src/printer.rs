use qrcode::{render::unicode, QrCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    name: String,
    is_default: bool,
    is_offline: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintRequest {
    printer_name: String,
    kind: String,
    copies: u8,
    payload: Value,
}

fn value(payload: &Value, key: &str) -> Option<String> {
    payload.get(key).and_then(|item| match item { Value::String(text) => Some(text.clone()), Value::Number(number) => Some(number.to_string()), _ => None }).filter(|text| !text.is_empty())
}

fn line(output: &mut String, label: &str, payload: &Value, key: &str) {
    if let Some(text) = value(payload, key) { output.push_str(&format!("{label}: {text}\n")); }
}

fn format_job(kind: &str, payload: &Value) -> Result<String, String> {
    let mut output = String::new();
    if kind == "LABEL" {
        line(&mut output, "رقم الصيانة", payload, "repairNumber"); line(&mut output, "الماركة", payload, "brand"); line(&mut output, "الموديل", payload, "model"); line(&mut output, "العميل", payload, "customer"); line(&mut output, "التاريخ", payload, "intakeDate");
    } else {
        line(&mut output, "المركز", payload, "shopName"); line(&mut output, "الفرع", payload, "branch"); output.push_str("--------------------------------\n"); line(&mut output, "رقم الصيانة", payload, "repairNumber"); line(&mut output, "التاريخ", payload, "deliveredAt"); line(&mut output, "العميل", payload, "customer"); line(&mut output, "الهاتف", payload, "phone"); line(&mut output, "الماركة", payload, "brand"); line(&mut output, "الموديل", payload, "model"); line(&mut output, "الجهاز", payload, "device"); line(&mut output, "اللون", payload, "color"); line(&mut output, "IMEI", payload, "imei"); line(&mut output, "العطل", payload, "fault"); line(&mut output, "التكلفة التقديرية", payload, "estimatedCost"); line(&mut output, "السعر النهائي", payload, "finalCharge"); line(&mut output, "العربون", payload, "deposit"); line(&mut output, "المدفوع سابقًا", payload, "previouslyPaid"); line(&mut output, "المحصل", payload, "collected"); line(&mut output, "المتبقي", payload, "estimatedRemaining"); line(&mut output, "المتبقي", payload, "remaining"); line(&mut output, "", payload, "receiptFooter");
    }
    if let Some(qr_value) = value(payload, "qrValue").or_else(|| value(payload, "trackingUrl")) {
        output.push_str("\n");
        let code = QrCode::new(qr_value.as_bytes()).map_err(|error| error.to_string())?;
        output.push_str(&code.render::<unicode::Dense1x2>().quiet_zone(true).build()); output.push_str("\n"); output.push_str(&qr_value); output.push_str("\n");
    }
    Ok(output)
}

#[tauri::command]
pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    let script = "$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); @(Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline) | ConvertTo-Json -Compress";
    let result = Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", script]).output().map_err(|error| error.to_string())?;
    if !result.status.success() { return Err(String::from_utf8_lossy(&result.stderr).trim().to_string()); }
    let json: Value = serde_json::from_slice(&result.stdout).map_err(|error| error.to_string())?;
    let items = json.as_array().cloned().unwrap_or_else(|| if json.is_null() { vec![] } else { vec![json] });
    Ok(items.into_iter().filter_map(|item| Some(PrinterInfo { name: item.get("Name")?.as_str()?.to_string(), is_default: item.get("Default").and_then(Value::as_bool).unwrap_or(false), is_offline: item.get("WorkOffline").and_then(Value::as_bool).unwrap_or(false) })).collect())
}

#[tauri::command]
pub fn print_job(request: PrintRequest) -> Result<(), String> {
    if request.printer_name.trim().is_empty() || request.copies == 0 || request.copies > 10 { return Err("إعدادات الطابعة غير صحيحة".into()); }
    let available = list_printers()?; if !available.iter().any(|item| item.name == request.printer_name) { return Err("الطابعة المحددة غير موجودة".into()); }
    let content = format_job(&request.kind, &request.payload)?;
    for _ in 0..request.copies {
        let script = "$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); [Console]::InputEncoding=[Text.UTF8Encoding]::new(); $text=[Console]::In.ReadToEnd(); $text | Out-Printer -Name $args[0]";
        let mut child = Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", script, &request.printer_name]).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped()).spawn().map_err(|error| error.to_string())?;
        child.stdin.as_mut().ok_or("تعذر فتح قناة الطباعة")?.write_all(content.as_bytes()).map_err(|error| error.to_string())?;
        let result = child.wait_with_output().map_err(|error| error.to_string())?; if !result.status.success() { return Err(String::from_utf8_lossy(&result.stderr).trim().to_string()); }
    }
    Ok(())
}