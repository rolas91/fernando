import React from 'react';
import AppLayout from '@/components/AppLayout';
import { AppProvider } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import LoginPage from '@/pages/LoginPage';
import { Loader2 } from 'lucide-react';

const IndexContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-600 rounded-xl flex items-center justify-center font-bold text-white text-2xl mx-auto mb-4">
            DR
          </div>
          <Loader2
            size={24}
            className="animate-spin text-primary mx-auto mb-3"
          />
          <p className="text-sm text-gray-500">Loading DR Traffic Control...</p>
        </div>
      </div>
    );
  }

  return (
    <AppProvider key={user?.id || 'guest'}>
      {!isAuthenticated ? <LoginPage /> : <AppLayout />}
    </AppProvider>
  );
};

const Index: React.FC = () => {
  return <IndexContent />;
};

export default Index;
