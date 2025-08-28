export function Select({ value, onValueChange, children }) {
    // Visual wrapper only; the dashboard handles state.
    return <div data-value={value} data-onchange={!!onValueChange}>{children}</div>;
  }
  export function SelectTrigger({ children }) { return <div className="border rounded-xl px-3 py-2 bg-white">{children}</div>; }
  export function SelectValue({ placeholder }) { return <span className="text-gray-600">{placeholder || ""}</span>; }
  export function SelectContent({ children }) { return <div className="mt-2">{children}</div>; }
  export function SelectItem({ value, children }) {
    return <div className="block w-full text-left px-3 py-1.5 rounded hover:bg-gray-100" data-value={value}>{children}</div>;
  }