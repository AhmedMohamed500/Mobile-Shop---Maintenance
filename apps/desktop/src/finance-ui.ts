export const formatFinanceMoney = (value: number) => `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ج.م`;
export const financeKpis = ["الإيراد", "التحصيلات", "العربون", "التحصيل النهائي", "المصروفات", "المردودات", "المتبقي", "حركة النقدية"] as const;
