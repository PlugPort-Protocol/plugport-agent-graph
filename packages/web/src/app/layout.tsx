import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'PlugPort Agent Graph',
    description: 'Verifiable agent memory on PlugPort, anchored on Monad',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
