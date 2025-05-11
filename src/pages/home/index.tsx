import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api } from '@/lib/api';
import { API_ROUTES } from '@/config/api';

// Interface for the actual user data within the payload
interface UserData {
  id: string;
  email: string;
  userType: string;
  status: string;
  createdAt?: string; // Added for consistency with global User type
  updatedAt?: string; // Added for consistency with global User type
  // Allow any other string properties that might come from the API payload
  [key: string]: any;
}

// Interface for the full API response from /auth/me
interface AuthMeApiResponse {
  status: string;
  statusCode: number;
  message: string;
  payload: UserData;
}

interface HomePageLocationState {
  message?: string;
}

export default function HomePage() {
  const location = useLocation();
  const [user, setUser] = useState<UserData | null>(null); // User state now holds UserData
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const typedState = location.state as HomePageLocationState | null;
  const successMessage = typedState?.message;

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true);
        // Fetch the full API response structure
        const response = await api.get<AuthMeApiResponse>(API_ROUTES.me);
        setUser(response.payload); // Set the user state with the payload content
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch user information';
        setError(message);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const integrationLinks = [
    { name: 'Browser extensions', url: 'https://github.com/canvas-ai/canvas-browser-extensions', description: 'Integrate Canvas directly into your web browser.' },
    { name: 'CLI Client', url: 'https://github.com/canvas-ai/canvas-cli', description: 'Manage Canvas from your command line.' },
    { name: 'Shell client', url: 'https://github.com/canvas-ai/canvas-shell', description: 'Interact with Canvas using a shell interface.' },
    { name: 'Electron UI', url: 'https://github.com/canvas-ai/canvas-electron', description: 'Use the Canvas desktop application.' },
  ];

  return (
    <div className="container mx-auto p-4">
      <div className="grid gap-6">
        <Card className="w-full shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-black-600">
              {successMessage ? successMessage : "Welcome to your Universe ..indexed!"}
            </CardTitle>
            {!successMessage && <CardDescription>&#8734;</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-8">
            {loading && <p className="text-center text-muted-foreground">Loading user information...</p>}
            {error && <p className="text-center text-destructive">Error: {error}</p>}

            {user && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">User Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* This part should now correctly iterate over the payload (user object) */}
                  {Object.entries(user).map(([key, value]) => {
                    if (typeof value === 'string' || typeof value === 'number') {
                      return (
                        <p key={key}>
                          <strong className="capitalize">{key.replace(/([A-Z])/g, ' $1')}:</strong> {value.toString()}
                        </p>
                      );
                    }
                    return null;
                  })}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Integrate Canvas into your workflows:</CardTitle>
                <CardDescription>
                  Enhance your productivity by connecting Canvas with your favorite tools.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  {integrationLinks.map((link) => (
                    <li key={link.name} className="border p-4 rounded-md hover:shadow-md transition-shadow">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary hover:underline text-lg"
                      >
                        {link.name}
                      </a>
                      <p className="text-sm text-muted-foreground mt-1">{link.description}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <div className="text-center">
              <Link to="/workspaces" className="text-primary hover:underline">
                Go to your Workspaces &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
