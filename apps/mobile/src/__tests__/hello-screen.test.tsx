import { render, screen } from '@testing-library/react-native';

import HelloScreen from '@/app/index';

describe('HelloScreen', () => {
  it('greets the user', async () => {
    await render(<HelloScreen />);

    expect(screen.getByText('Hello, treino-tracker')).toBeTruthy();
  });
});
