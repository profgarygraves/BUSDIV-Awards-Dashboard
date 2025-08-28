export function Input(props) {
    return <input {...props} className={`border rounded-xl px-3 py-2 ${props.className || ""}`} />;
  }