import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

test('renders h4kstream header', () => {
  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
  const headerElements = screen.getAllByRole('heading', { name: /\[h4kstream\]/i });
  expect(headerElements.length).toBeGreaterThan(0);
});
