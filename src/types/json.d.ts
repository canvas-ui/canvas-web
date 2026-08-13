type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

declare module "*.json" {
  const value: JsonValue;
  export default value;
}
