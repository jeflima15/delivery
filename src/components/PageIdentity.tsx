import { useLayoutEffect } from 'react';
import { installPageIdentity, type PageIdentityScope } from '../lib/browserIdentity';

export default function PageIdentity({ slug, admin, title }: PageIdentityScope) {
  useLayoutEffect(() => installPageIdentity({ slug, admin, title }), [slug, admin, title]);
  return null;
}
