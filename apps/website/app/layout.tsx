import type { Metadata } from 'next';
import '@camadb/design/styles.css';
import './site.css';

export const metadata: Metadata = {
  title: 'CamaDB — Local data, measured',
  description:
    'An open-source embedded TypeScript database for local-first applications, inspectable retrieval, and private AI memory.',
  metadataBase: new URL('https://elmarti.github.io/camadb/'),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
