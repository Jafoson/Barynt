// Imports a package the host never mapped: must fail loudly, not silently.
import { chunk } from "lodash-es";

export default function BareImport() {
  return <span>{JSON.stringify(chunk([1, 2, 3, 4], 2))}</span>;
}
