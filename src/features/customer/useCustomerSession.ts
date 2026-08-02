import { useCallback, useEffect, useState } from 'react';
import { customerApi, type CustomerIntent } from './api';

export type CustomerAuthState =
  | 'bootstrapping'
  | 'anonymous'
  | 'phoneEntry'
  | 'existingLogin'
  | 'newRegistration'
  | 'recoveringPassword'
  | 'authenticated';

export function useCustomerSession(slug: string) {
  const [user, setUser] = useState<any>(null);
  const [state, setState] = useState<CustomerAuthState>('bootstrapping');
  const [pendingIntent, setPendingIntent] = useState<CustomerIntent>(null);

  useEffect(() => {
    let active = true;
    setState('bootstrapping');
    customerApi(slug).session()
      .then((result) => {
        if (!active) return;
        setUser(result.authenticated ? result.user : null);
        setState(result.authenticated ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setState('anonymous');
      });
    return () => { active = false; };
  }, [slug]);

  const begin = useCallback((intent: CustomerIntent = null) => {
    setPendingIntent(intent);
    setState('phoneEntry');
  }, []);

  const authenticated = useCallback((nextUser: any) => {
    setUser(nextUser);
    setState('authenticated');
    setPendingIntent((intent) => intent);
  }, []);

  const consumeIntent = useCallback(() => {
    const consumed = pendingIntent;
    setPendingIntent(null);
    return consumed;
  }, [pendingIntent]);

  const anonymous = useCallback(() => {
    setUser(null);
    setState('anonymous');
    setPendingIntent(null);
  }, []);

  return { user, setUser, state, setState, pendingIntent, begin, authenticated, consumeIntent, anonymous };
}
