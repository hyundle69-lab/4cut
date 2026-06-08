import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the photo booth app', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /life 4 cut/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /촬영 시작/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /timer on/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /flash on/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /filter on/i })).toBeInTheDocument();
});
