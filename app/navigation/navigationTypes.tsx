// navigationTypes.ts
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Customer, Transaction } from "../screen/CustomersTransactions"; // Make sure to import these types

// Define the CustomRange type here as well for use in params
type CustomRange = { startDate: Date | null; endDate: Date | null; };


 
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Onboarding: undefined;
  MainTabs: { 
    screen?: "Customers" | "Transactions" | "Account"; 
    params?: { 
      username: string; 
      profileImage?: string 
    }; 
  };
  Account: { 
    username: string; 
    profileImage?: string; 
  };
  Home: undefined;
  AddCustomer: undefined;
  CustomerDetails: { 
    customer: Customer 
  };
  AllTransactionsScreen: { 
    customer: Customer;
    transactions: Transaction[];
    filter: string;
    customRange: CustomRange;
  };
  ForgotPassword: { 
    email: string 
  };
  ForgotPasswordScreen: undefined;
  CustomersTransactions: undefined;
  EditProfile: undefined;
  Customers: undefined;
  Settings: undefined;
  Currency: undefined;
  ChangePassword: undefined;
  OldTransactions: undefined;
    BalanceHistoryScreen: { customer: Customer }; // Add this line

};

// Change the route from "MainTabs" to "Home" here:
export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, "MainTabs">;
export type AccountScreenPops = NativeStackScreenProps<RootStackParamList, "Account">;
export type CurrencyDropdownNavigationProp = NativeStackScreenProps<RootStackParamList, "Currency">;
export type AllTransactionsScreenProps = NativeStackScreenProps<RootStackParamList, "AllTransactionsScreen">;