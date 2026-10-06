
export const formatMoney = (value) => {
  const n = Number(value) || 0;
  const rounded = Math.abs(n) < 0.005 ? 0 : n;
  const text = Math.abs(rounded).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return rounded < 0 ? `-Rs. ${text}` : `Rs. ${text}`;
};
