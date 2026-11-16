import { render, screen } from '@testing-library/react-native';

import HelloScreen from '@/app/index';
import i18n from '@/lib/i18n';

describe('HelloScreen', () => {
  // The device language decides the starting language, so every test sets its own.
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('greets the user', async () => {
    await i18n.changeLanguage('en');
    await render(<HelloScreen />);

    expect(screen.getByText('Hello, treino-tracker')).toBeTruthy();
  });

  it("shows today's date", async () => {
    await i18n.changeLanguage('en');
    await render(<HelloScreen />);

    expect(screen.getByText(/Today: \d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/)).toBeTruthy();
  });

  it('speaks Brazilian Portuguese when that is the language', async () => {
    await i18n.changeLanguage('pt-BR');
    await render(<HelloScreen />);

    expect(screen.getByText('Olá, treino-tracker')).toBeTruthy();
    expect(screen.getByText(/Hoje: \d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/)).toBeTruthy();
  });
});
