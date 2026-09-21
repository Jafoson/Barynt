// A well-behaved plugin: React and the SDK are externals, so the host's copies are used.
import { useHostContext } from "@barynt/plugin-sdk";
import { useEffect, useState } from "react";

export default function HelloClient() {
  const host = useHostContext();
  const [count, setCount] = useState(0);

  // Proves hooks work: state changes after mount without any user input.
  useEffect(() => {
    const timer = setTimeout(() => setCount((value) => value + 1), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="hello-client" data-testid="plugin-root">
      <strong>Hello from a runtime plugin</strong>
      <span data-testid="count">count:{count}</span>
      <span data-testid="context">
        user:{host.user} workspace:{host.workspace}
      </span>
    </section>
  );
}
