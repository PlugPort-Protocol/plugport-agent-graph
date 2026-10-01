// Optional password gate: the viewer shows the agent wallet's private
// memories, so a public deployment should set VIEWER_PASSWORD (HTTP basic
// auth, any username).

import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const password = process.env.VIEWER_PASSWORD;
    if (!password) return NextResponse.next();
    const [scheme, encoded] = (request.headers.get('authorization') ?? '').split(' ');
    if (scheme === 'Basic' && encoded) {
        const decoded = atob(encoded);
        if (decoded.slice(decoded.indexOf(':') + 1) === password) return NextResponse.next();
    }
    return new NextResponse('Authentication required', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="PlugPort Agent Graph"' },
    });
}

export const config = { matcher: '/:path*' };
