import { findModel } from './models/registry';
import { Landing } from './site/Landing';
import { ModelPage, NotFound } from './site/ModelPage';
import { RouterProvider, useRouter } from './site/router';

function Routes() {
  const { path } = useRouter();

  if (path === '/') return <Landing />;

  const match = path.match(/^\/models\/([^/]+)$/);
  if (match) {
    const model = findModel(match[1]);
    if (model) return <ModelPage key={model.slug} model={model} />;
  }

  return <NotFound />;
}

export default function App() {
  return (
    <RouterProvider>
      <Routes />
    </RouterProvider>
  );
}
