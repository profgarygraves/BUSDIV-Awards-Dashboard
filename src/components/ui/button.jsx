export function Button({ children, onClick, variant, title, className = "" }) {
    const style = variant === "outline"
      ? "border px-3 py-2 rounded-xl hover:bg-gray-50"
      : "bg-black text-white px-3 py-2 rounded-xl hover:opacity-90";
    return <button onClick={onClick} title={title} className={`${style} ${className}`}>{children}</button>;
  }