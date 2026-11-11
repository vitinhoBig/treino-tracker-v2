import Constants from 'expo-constants';

/** Thrown when the app is set up wrongly. Messages name the variable and never print its value. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type AppConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  apiUrl: string;
};

type RawConfig = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  apiUrl?: string;
};

type Environment = {
  /** The Metro dev server's address as Expo reports it, such as "192.168.1.20:8081". */
  hostUri?: string;
  isDev: boolean;
};

// "127.0.0.1" and "localhost" on a phone mean the phone itself, never the laptop running the services.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

// Parsed by hand because React Native's built-in URL class has historically left parts of it
// unimplemented, and a polyfill is not worth adding for this.
const HTTP_URL = /^(https?):\/\/(\[[0-9a-f:.]+\]|[^\s/:?#[\]]+)(?::(\d{1,5}))?([/?#]\S*)?$/i;

/**
 * In development, swaps a loopback host in `url` for the laptop's address, so a phone running the
 * app can reach services started on the laptop. Everything else about the URL stays the same.
 *
 * The URL is returned unchanged when:
 * - it doesn't point at the loopback address (a real server needs no swap)
 * - there is no dev server address, which is the case in a production build
 * - the dev server address is not an IPv4 address, such as a tunnel's domain name, because the
 *   services on the laptop can't be reached through a tunnel to Metro
 */
export function resolveDevUrl(url: string, hostUri: string | undefined): string {
  const target = HTTP_URL.exec(url);
  if (!hostUri || !target) return url;
  const [, scheme, host, port, rest = ''] = target;
  if (!LOOPBACK_HOSTS.has(host.toLowerCase())) return url;

  const devHost = hostUri.trim().split(':')[0];
  if (!IPV4.test(devHost)) return url;

  return `${scheme}://${devHost}${port ? `:${port}` : ''}${rest}`;
}

function readUrl(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ConfigError(`${name} is not set. Copy apps/mobile/.env.example to apps/mobile/.env.`);
  }
  if (!HTTP_URL.test(trimmed)) {
    throw new ConfigError(`${name} must be a full http(s) URL, such as http://127.0.0.1:54321.`);
  }
  return trimmed.replace(/\/+$/, '');
}

function readPublishableKey(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ConfigError(`${name} is not set. Copy apps/mobile/.env.example to apps/mobile/.env.`);
  }
  // Anything prefixed EXPO_PUBLIC_ ships inside the app, where anyone can read it.
  if (trimmed.startsWith('sb_secret_')) {
    throw new ConfigError(`${name} holds a secret key. Use the publishable key, which RLS protects.`);
  }
  return trimmed;
}

/** Validates the raw values and, in development, points the URLs at the laptop. Pure, so it is tested directly. */
export function loadConfig(raw: RawConfig, environment: Environment): AppConfig {
  const supabaseUrl = readUrl('EXPO_PUBLIC_SUPABASE_URL', raw.supabaseUrl);
  const apiUrl = readUrl('EXPO_PUBLIC_API_URL', raw.apiUrl);
  const supabasePublishableKey = readPublishableKey(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    raw.supabasePublishableKey,
  );

  const hostUri = environment.isDev ? environment.hostUri : undefined;
  return {
    supabaseUrl: resolveDevUrl(supabaseUrl, hostUri),
    apiUrl: resolveDevUrl(apiUrl, hostUri),
    supabasePublishableKey,
  };
}

let cached: AppConfig | undefined;

/** The app's configuration, read once. Throws a ConfigError if the environment is incomplete. */
export function getConfig(): AppConfig {
  // Expo swaps `process.env.EXPO_PUBLIC_X` for its value at build time, but only when each name is
  // written out in full like this. Passing `process.env` around or indexing it would read nothing.
  cached ??= loadConfig(
    {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
    },
    { hostUri: Constants.expoConfig?.hostUri, isDev: __DEV__ },
  );
  return cached;
}
