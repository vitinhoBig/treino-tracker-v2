import { ConfigError, loadConfig, resolveDevUrl } from '@/lib/config';

const LAPTOP = '192.168.87.214:8081';

describe('resolveDevUrl', () => {
  it('points a loopback URL at the laptop and keeps its own port', () => {
    expect(resolveDevUrl('http://127.0.0.1:54321', LAPTOP)).toBe('http://192.168.87.214:54321');
  });

  it('treats localhost and [::1] as loopback too', () => {
    expect(resolveDevUrl('http://localhost:8000', LAPTOP)).toBe('http://192.168.87.214:8000');
    expect(resolveDevUrl('http://[::1]:8000', LAPTOP)).toBe('http://192.168.87.214:8000');
  });

  it('keeps the scheme, path and query', () => {
    expect(resolveDevUrl('https://127.0.0.1:8443/v1/me?x=1', LAPTOP)).toBe(
      'https://192.168.87.214:8443/v1/me?x=1',
    );
  });

  it('keeps a URL with no port without inventing one', () => {
    expect(resolveDevUrl('http://localhost', LAPTOP)).toBe('http://192.168.87.214');
  });

  it('never uses the dev server port, only its host', () => {
    expect(resolveDevUrl('http://127.0.0.1:8000', '10.0.0.5:19000')).toBe('http://10.0.0.5:8000');
  });

  it('leaves a real server alone', () => {
    expect(resolveDevUrl('https://api.example.com', LAPTOP)).toBe('https://api.example.com');
  });

  it('leaves the URL alone when there is no dev server address', () => {
    expect(resolveDevUrl('http://127.0.0.1:54321', undefined)).toBe('http://127.0.0.1:54321');
    expect(resolveDevUrl('http://127.0.0.1:54321', '')).toBe('http://127.0.0.1:54321');
  });

  it('leaves the URL alone when Metro runs through a tunnel', () => {
    expect(resolveDevUrl('http://127.0.0.1:54321', 'abc-123.exp.direct:80')).toBe(
      'http://127.0.0.1:54321',
    );
  });
});

describe('loadConfig', () => {
  const raw = {
    supabaseUrl: 'http://127.0.0.1:54321',
    supabasePublishableKey: 'sb_publishable_test',
    apiUrl: 'http://127.0.0.1:8000',
  };

  it('points both URLs at the laptop in development', () => {
    expect(loadConfig(raw, { hostUri: LAPTOP, isDev: true })).toEqual({
      supabaseUrl: 'http://192.168.87.214:54321',
      supabasePublishableKey: 'sb_publishable_test',
      apiUrl: 'http://192.168.87.214:8000',
    });
  });

  it('does not touch the URLs outside development', () => {
    const config = loadConfig(raw, { hostUri: LAPTOP, isDev: false });

    expect(config.supabaseUrl).toBe('http://127.0.0.1:54321');
    expect(config.apiUrl).toBe('http://127.0.0.1:8000');
  });

  it('trims spaces and trailing slashes', () => {
    const config = loadConfig(
      { ...raw, supabaseUrl: ' https://abc.supabase.co/ ', supabasePublishableKey: ' key ' },
      { isDev: false },
    );

    expect(config.supabaseUrl).toBe('https://abc.supabase.co');
    expect(config.supabasePublishableKey).toBe('key');
  });

  it.each([
    ['EXPO_PUBLIC_SUPABASE_URL', { supabaseUrl: undefined }],
    ['EXPO_PUBLIC_SUPABASE_URL', { supabaseUrl: '   ' }],
    ['EXPO_PUBLIC_API_URL', { apiUrl: '' }],
    ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', { supabasePublishableKey: undefined }],
  ])('names %s when it is missing', (name, override) => {
    expect(() => loadConfig({ ...raw, ...override }, { isDev: false })).toThrow(
      new RegExp(`${name} is not set`),
    );
  });

  it('refuses a secret key and does not repeat it', () => {
    const secret = 'sb_secret_do_not_print_me';
    const attempt = () => loadConfig({ ...raw, supabasePublishableKey: secret }, { isDev: false });

    expect(attempt).toThrow(ConfigError);
    expect(attempt).toThrow(/secret key/);
    expect(attempt).not.toThrow(new RegExp(secret));
  });

  describe.each([
  ['EXPO_PUBLIC_SUPABASE_URL', 'supabaseUrl'],
    ['EXPO_PUBLIC_API_URL', 'apiUrl'],
  ])('%s', (name, field) => {
    it.each(['localhost:54321', 'ftp://host', 'http://', 'http://has space'])(
      'rejects the malformed value %j',
      (bad) => {
        const attempt = () => loadConfig({ ...raw, [field]: bad }, { isDev: false });

        expect(attempt).toThrow(ConfigError);
        expect(attempt).toThrow(name);
        expect(attempt).toThrow('must be a full http(s) URL');
      },
    );
  });
});
