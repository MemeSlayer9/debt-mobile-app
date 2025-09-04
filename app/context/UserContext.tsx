import React, { createContext, useState, useContext, ReactNode, useEffect } from "react";
import { supabase } from "../supabase/supabaseClient";
import AsyncStorage from '@react-native-async-storage/async-storage';

type User = {
  id: string;
  username: string;
  profileImage: string;
};

type UserContextProps = {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
  loading: boolean;
};

// Export the UserContext so it can be imported elsewhere
export const UserContext = createContext<UserContextProps | undefined>(undefined);

// Storage key for user data
const USER_STORAGE_KEY = '@app_user_data';

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Function to store user data in AsyncStorage
  const storeUserData = async (userData: User | null) => {
    try {
      if (userData) {
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
      } else {
        await AsyncStorage.removeItem(USER_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Error storing user data:", error);
    }
  };

  // Custom setter that updates both state and AsyncStorage
  const handleSetUser = (userData: User | null) => {
    setUser(userData);
    storeUserData(userData);
  };

  // Check for existing session on mount
  useEffect(() => {
    const checkUserSession = async () => {
      try {
        // First check AsyncStorage for cached user data
        const storedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
        
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }

        // Then verify with Supabase that the session is still valid
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Error getting session:", error);
          handleSetUser(null); // Clear user if there's an error
          setLoading(false);
          return;
        }

        if (data.session) {
          // User is signed in, fetch their profile data
          const { data: userData, error: userError } = await supabase
            .from('profile')  // Changed from 'profiles' to 'profile'
            .select('id, username, profile_image')
            .eq('id', data.session.user.id)
            .single();

          if (userError) {
            console.error("Error fetching user profile:", userError);
            handleSetUser(null);
          } else if (userData) {
            const userProfile = {
              id: userData.id,
              username: userData.username,
              profileImage: userData.profile_image
            };
            handleSetUser(userProfile);
          }
        } else if (storedUser) {
          // If we have stored user but no active session, clear it
          handleSetUser(null);
        }
      } catch (error) {
        console.error("Session check error:", error);
        handleSetUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkUserSession();
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          // User signed in, fetch their profile
          const { data: userData, error: userError } = await supabase
            .from('profile')  // Changed from 'profiles' to 'profile'
            .select('id, username, profile_image')
            .eq('id', session.user.id)
            .single();

          if (userError) {
            console.error("Error fetching user profile:", userError);
          } else if (userData) {
            const userProfile = {
              id: userData.id,
              username: userData.username,
              profileImage: userData.profile_image
            };
            handleSetUser(userProfile);
          }
        }
        
        if (event === 'SIGNED_OUT') {
          handleSetUser(null);
        }
      }
    );

    return () => {
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      handleSetUser(null);
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  };

  return (
    <UserContext.Provider value={{ user, setUser: handleSetUser, logout, loading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};