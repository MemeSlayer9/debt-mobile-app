import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { ActivityIndicator, View, Text, Image } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { StackNavigationOptions } from "@react-navigation/stack";

import OnboardingScreen from "../screen/OnboardingScreen";
import MainTabs from "../navigation/MainTabs";
import LoginScreen from "../MyAccount/LoginScreen";
import EditProfileScreen from "../MyAccount/EditProfileScreen";
import RegisterScreen from "../screen/RegisterScreen";
import AddCustomerScreen from "../screen/AddCustomer";
import CustomerDetailsScreen from "../screen/CustomerDetailsScreen";
import AllTransactionsScreen from "../screen/AllTransactionsScreen";
import CurrencyScreen from "../screen/CurrencyScreen";
import ForgotPasswordScreen from "../MyAccount/ForgotPasswordScreen";
import ChangePasswordScreen from "../MyAccount/ChangePasswordScreen";
import Settings from "../screen/Settings";
import CustomersTransactions from "../screen/CustomersTransactions";
import OldTransactionsScreen from "../screen/OldTransactionsScreen";
import { UserProvider, useUser } from "../context/UserContext";
import { CurrencyProvider } from "../context/CurrencyContext";
import { initQueueListener } from "../utils/OfflineQueue";
import { RootStackParamList } from "../navigation/navigationTypes";
import BalanceHistoryScreen from '../screen/BalanceHistoryScreen';

const Stack = createStackNavigator<RootStackParamList>();

// RootNavigator that chooses initial route based on auth state
function RootNavigator() {
  const { user, loading } = useUser();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [connectionChecked, setConnectionChecked] = useState(false);

  // Check network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
      setConnectionChecked(true);
    });

    // Perform initial check
    NetInfo.fetch().then(state => {
      setIsConnected(state.isConnected);
      setConnectionChecked(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Show loading indicator while auth status is checked or connectivity is being determined
  if (loading || !connectionChecked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#006A6A" />
      </View>
    );
  }

  // Optional: Show offline notification banner
  const OfflineBanner = () => {
    if (!isConnected) {
      return (
        <View style={{ 
          backgroundColor: '#FF3B30', 
          padding: 10, 
          alignItems: 'center', 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          zIndex: 999 
        }}>
          <Text style={{ color: 'white', fontWeight: 'bold' }}>You are offline</Text>
        </View>
      );
    }
    return null;
  };

  // Common header options with logo and back navigation
  const screenOptions: StackNavigationOptions = {
    headerStyle: { backgroundColor: "#0E1114" },
    headerTintColor: "#FFFFFF",
    headerTitleStyle: { 
      fontWeight: "bold" as const
    },
    headerTitle: () => (
      <Image
        source={require("@/assets/images/debttrackerlogo.png")}
        style={{ width: 170, height: 40 }}
        resizeMode="cover"
      />
    ),
  };

  return (
    <>
      <OfflineBanner />
      <Stack.Navigator
        initialRouteName={user ? "MainTabs" : "Onboarding"}
        screenOptions={screenOptions}
      >
        <Stack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Currency" component={CurrencyScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="AddCustomer" component={AddCustomerScreen} />
        <Stack.Screen 
          name="MainTabs" 
          component={MainTabs}
        />
        <Stack.Screen name="Settings" component={Settings} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <Stack.Screen name="CustomerDetails" component={CustomerDetailsScreen} />
        <Stack.Screen name="AllTransactionsScreen" component={AllTransactionsScreen} />
        <Stack.Screen name="CustomersTransactions" component={CustomersTransactions} />
               <Stack.Screen name="BalanceHistoryScreen" component={BalanceHistoryScreen} />

        <Stack.Screen name="OldTransactions" component={OldTransactionsScreen} />
      </Stack.Navigator>
    </>
  );
}

export default function AppNavigator() {
  // Initialize offline queue listener once on app start
  useEffect(() => {
    initQueueListener();

    // Set up a listener for application connectivity changes
    const unsubscribe = NetInfo.addEventListener(state => {
      console.log("Connection type:", state.type);
      console.log("Is connected?", state.isConnected);
      
      // You could trigger queue processing here when connection is restored
      if (state.isConnected) {
        // Optionally process any pending offline queue items
        // processOfflineQueue();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <UserProvider>
      <CurrencyProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </CurrencyProvider>
    </UserProvider>
  );
}