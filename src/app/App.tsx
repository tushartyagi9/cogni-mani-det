import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { router } from './routes';
import { AppProvider } from '../context/AppContext';

export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(13, 21, 37, 0.95)',
            border: '1px solid rgba(0, 229, 204, 0.3)',
            color: '#E8F3F1',
            fontFamily: "'IBM Plex Sans', sans-serif",
          },
        }}
      />
    </AppProvider>
  );
}
