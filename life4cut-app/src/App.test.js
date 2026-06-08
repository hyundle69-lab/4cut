import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the photo booth app', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /life in four cuts/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /start photo session/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /timer on/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /flash on/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /beauty filter on/i })).toBeInTheDocument();
});
