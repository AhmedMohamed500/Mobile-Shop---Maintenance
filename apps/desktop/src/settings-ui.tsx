import type { ChangeEvent } from "react";

export function LogoPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  function pick(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 300000) { window.alert("استخدم صورة PNG أو JPG أو WebP بحجم لا يتجاوز 300 كيلوبايت"); event.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => onChange(String(reader.result)); reader.readAsDataURL(file); }
  return <div className="logo-picker"><div className="logo-preview">{value ? <img src={value} alt="شعار المركز" /> : <span>لا يوجد شعار</span>}</div><div className="row wrap"><label className="ghost file-button">تغيير الشعار<input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} /></label>{value && <button type="button" className="ghost danger" onClick={() => onChange("")}>حذف الشعار</button>}</div><small>PNG أو JPG أو WebP · بحد أقصى 300 كيلوبايت</small></div>;
}
