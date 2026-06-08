import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the photo booth app', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /my 4 cut/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /camera on/i })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(/카메라를 지원하지 않습니다|권한을 허용/);
});
