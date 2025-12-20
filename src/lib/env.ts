export type SecretBinding = {
  get: () => Promise<string>;
};

export type EnvBinding<T extends string = string> = Partial<Record<T, string | SecretBinding>>;

export async function readEnvValue(binding: string | SecretBinding | undefined, fallbackKey: string) {
  if (binding) {
    if (typeof binding === "string") {
      return binding;
    }
    if (typeof binding.get === "function") {
      return binding.get();
    }
  }

  if (typeof process !== "undefined" && process.env?.[fallbackKey]) {
    return process.env[fallbackKey] as string;
  }

  throw new Error(`${fallbackKey} is not configured.`);
}
