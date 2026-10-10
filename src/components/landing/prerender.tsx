import { renderToString } from 'react-dom/server';
import PlatformLanding from './PlatformLanding';
import { landingDescription, landingTitle, platformOrigin } from './landingContent';

export function renderLanding() {
  return { html: renderToString(<PlatformLanding />), title: landingTitle, description: landingDescription, origin: platformOrigin };
}
