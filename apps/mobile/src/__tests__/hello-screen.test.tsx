import { render, screen } from '@testing-library/react-native';

import HelloScreen from '@/app/index';

describe('HelloScreen', () => {
  it('greets the user', async () => {
    await render(<HelloScreen />);

    expect(screen.getByText('Hello, treino-tracker')).toBeTruthy();
  });
  it('shows today\'s date', async () => {
    await render(<HelloScreen />);

    expect(screen.getByText(/\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}/)).toBeTruthy();
  });
});
