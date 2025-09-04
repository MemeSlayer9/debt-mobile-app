import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { TextInput as PaperTextInput, Button } from "react-native-paper";
import { DatePickerModal } from "react-native-paper-dates";
import { StackNavigationProp } from "@react-navigation/stack";
import { supabase } from "../supabase/supabaseClient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

type RootStackParamList = {
  InvoiceMobileUI: undefined;
  AddCustomer: undefined;
};

type AddCustomerScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "AddCustomer"
>;

type Props = {
  navigation: AddCustomerScreenNavigationProp;
};

// Interface for customer data
interface CustomerData {
  id?: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  date: string;
  user_id: string | null;
  synced: boolean;
}

const PENDING_CUSTOMERS_KEY = "pendingCustomers";

const AddCustomerScreen: React.FC<Props> = ({ navigation }) => {
  const [existingCustomerId, setExistingCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    balance: "",
  });
  const [customerDate, setCustomerDate] = useState<Date | null>(null);
  const [customerDatePickerVisible, setCustomerDatePickerVisible] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Check network connectivity
  useEffect(() => {
    const checkConnectivity = async () => {
      try {
        const connectionInfo = await NetInfo.fetch();
        setIsOnline(connectionInfo.isConnected === true);
      } catch (error) {
        console.error("Error checking connectivity:", error);
        setIsOnline(false);
      }
    };

    checkConnectivity();
    
    // Set up real-time connectivity listener
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected === true);
      
      // If we're coming back online and have a user ID, try to sync
      if (state.isConnected === true && userId) {
        syncPendingCustomers(userId);
      }
    });
    
    // Clean up listener on unmount
    return () => unsubscribe();
  }, [userId]);

  // Get current user session
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUserId(session?.user?.id || null);
        
        // If we have a user ID and we're online, attempt to sync any pending customers
        if (session?.user?.id && isOnline) {
          syncPendingCustomers(session.user.id);
        }
      } catch (error) {
        console.error("Error fetching user session:", error);
        // Try to get user ID from AsyncStorage as fallback
        const storedUserId = await AsyncStorage.getItem("userId");
        setUserId(storedUserId);
      }
    };
    fetchUser();
  }, [isOnline]);

  // Check for existing customer
  useEffect(() => {
    const checkExistingCustomer = async () => {
      const trimmedName = newCustomer.name.trim();
      if (!trimmedName || !userId) return;

      try {
        if (isOnline) {
          // Online check with Supabase
          const { data, error } = await supabase
            .from("customers")
            .select("*")
            .ilike("name", trimmedName)
            .eq("user_id", userId);

          if (error) throw error;

          if (data && data.length > 0) {
            handleExistingCustomerFound(data);
          }
        } else {
          // Offline check with local storage
          const localCustomers = await getLocalCustomers();
          const matchingCustomers = localCustomers.filter(
            c => c.name.toLowerCase() === trimmedName.toLowerCase() && c.user_id === userId
          );
          
          if (matchingCustomers.length > 0) {
            handleExistingCustomerFound(matchingCustomers);
          }
        }
      } catch (error) {
        console.error("Error checking existing customers:", error);
      }
    };

    const handleExistingCustomerFound = (customers: any[]) => {
      const hasNonZeroBalance = customers.some(c => c.balance > 0);
      if (hasNonZeroBalance) {
        Alert.alert(
          "Warning",
          "Customer with this name exists with balance! Fields have been cleared.",
          [{
            text: "OK",
            onPress: () => {
              setNewCustomer(prev => ({ ...prev, name: "" }));
              setCustomerDate(null);
            }
          }]
        );
        setExistingCustomerId(null);
      } else {
        const customer = customers[0];
        setNewCustomer({
          name: customer.name,
          email: customer.email || "",
          phone: customer.phone || "",
          balance: (customer.balance || 0).toString(),
        });
        setCustomerDate(customer.date ? new Date(customer.date) : null);
        setExistingCustomerId(customer.id);
        Alert.alert("Info", "Loaded existing customer with zero balance");
      }
    };

    const debounceTimer = setTimeout(checkExistingCustomer, 500);
    return () => clearTimeout(debounceTimer);
  }, [newCustomer.name, userId, isOnline]);

  const validateForm = () => {
    if (!userId) {
      Alert.alert("Error", "User not authenticated");
      return false;
    }
    if (!newCustomer.name.trim()) {
      Alert.alert("Error", "Customer name is required");
      return false;
    }
    if (newCustomer.phone && !/^\d+$/.test(newCustomer.phone)) {
      Alert.alert("Error", "Invalid phone number format");
      return false;
    }
    if (newCustomer.balance && !/^\d+$/.test(newCustomer.balance)) {
      Alert.alert("Error", "Invalid balance format");
      return false;
    }
    return true;
  };

  // Get locally stored customers
  const getLocalCustomers = async (): Promise<CustomerData[]> => {
    try {
      const storedCustomers = await AsyncStorage.getItem(PENDING_CUSTOMERS_KEY);
      return storedCustomers ? JSON.parse(storedCustomers) : [];
    } catch (error) {
      console.error("Error reading local customers:", error);
      return [];
    }
  };

  // Save customer locally
  const saveCustomerLocally = async (customerData: CustomerData) => {
    try {
      // Generate a temporary local ID
      const localId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      customerData.id = customerData.id || localId;
      customerData.synced = false;
      
      const existingCustomers = await getLocalCustomers();
      
      // If updating an existing local customer
      if (existingCustomerId && existingCustomerId.startsWith('local_')) {
        const updatedCustomers = existingCustomers.map(c => 
          c.id === existingCustomerId ? { ...customerData } : c
        );
        await AsyncStorage.setItem(PENDING_CUSTOMERS_KEY, JSON.stringify(updatedCustomers));
      } else {
        // Adding new customer
        existingCustomers.push(customerData);
        await AsyncStorage.setItem(PENDING_CUSTOMERS_KEY, JSON.stringify(existingCustomers));
      }
      
      // Store user ID for offline use
      if (userId) {
        await AsyncStorage.setItem("userId", userId);
      }
      
      return true;
    } catch (error) {
      console.error("Error saving customer locally:", error);
      return false;
    }
  };

  // Sync pending customers when online
  const syncPendingCustomers = async (currentUserId: string) => {
    if (!isOnline) return;
    
    try {
      const pendingCustomers = await getLocalCustomers();
      const unsyncedCustomers = pendingCustomers.filter(c => !c.synced);
      
      if (unsyncedCustomers.length === 0) return;
      
      let syncedCount = 0;
      const updatedCustomers = [...pendingCustomers];
      
      for (const customer of unsyncedCustomers) {
        // Skip if the customer belongs to a different user
        if (customer.user_id !== currentUserId) continue;
        
        // Remove local fields before sending to Supabase
        const { synced, ...customerToSync } = customer;
        const isLocalId = customer.id?.startsWith('local_');
        
        try {
          if (isLocalId) {
            // This is a new customer that was created offline
            delete customerToSync.id;
            const { data, error } = await supabase.from("customers").insert([customerToSync]).select();
            
            if (error) throw error;
            
            // Update local copy with the real ID from Supabase
            if (data && data[0]) {
              const customerIndex = updatedCustomers.findIndex(c => c.id === customer.id);
              if (customerIndex >= 0) {
                updatedCustomers[customerIndex] = { ...data[0], synced: true };
              }
            }
          } else {
            // This is an update to an existing customer
            const { id, ...updateData } = customerToSync;
            const { error } = await supabase
              .from("customers")
              .update(updateData)
              .eq("id", id)
              .eq("user_id", currentUserId);
              
            if (error) throw error;
            
            // Mark as synced
            const customerIndex = updatedCustomers.findIndex(c => c.id === customer.id);
            if (customerIndex >= 0) {
              updatedCustomers[customerIndex].synced = true;
            }
          }
          
          syncedCount++;
        } catch (syncError) {
          console.error(`Error syncing customer ${customer.id}:`, syncError);
        }
      }
      
      // Save updated sync status
      await AsyncStorage.setItem(PENDING_CUSTOMERS_KEY, JSON.stringify(updatedCustomers));
      
      if (syncedCount > 0) {
        console.log(`Synced ${syncedCount} customers`);
      }
    } catch (error) {
      console.error("Error during customer sync:", error);
    }
  };

  const handleSaveCustomer = async () => {
    if (!validateForm()) return;
    setLoading(true);

    try {
      const customerData: CustomerData = {
        name: newCustomer.name.trim(),
        email: newCustomer.email.trim(),
        phone: newCustomer.phone.trim(),
        balance: parseInt(newCustomer.balance) || 0,
        date: customerDate?.toISOString() || new Date().toISOString(),
        user_id: userId,
        synced: false
      };

      if (isOnline) {
        // We're online, try to save directly to Supabase
        if (existingCustomerId && !existingCustomerId.startsWith('local_')) {
          const { error } = await supabase
            .from("customers")
            .update({
              name: customerData.name,
              email: customerData.email,
              phone: customerData.phone,
              balance: customerData.balance,
              date: customerData.date
            })
            .eq("id", existingCustomerId)
            .eq("user_id", userId);

          if (error) throw error;
          Alert.alert("Success", "Customer updated successfully!");
        } else {
          const { error } = await supabase
            .from("customers")
            .insert([{
              name: customerData.name,
              email: customerData.email,
              phone: customerData.phone,
              balance: customerData.balance,
              date: customerData.date,
              user_id: userId
            }]);

          if (error) throw error;
          Alert.alert("Success", "Customer added successfully!");
        }
      } else {
        // We're offline, save locally
        if (existingCustomerId) {
          customerData.id = existingCustomerId;
        }
        
        const saved = await saveCustomerLocally(customerData);
        if (saved) {
          Alert.alert(
            "Saved Offline",
            "Customer saved locally and will be synced when you're back online."
          );
        } else {
          throw new Error("Failed to save customer data locally");
        }
      }

      navigation.goBack();
    } catch (error) {
      let errorMessage = "An unexpected error occurred";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {existingCustomerId ? "Edit Customer" : "Add New Customer"}
      </Text>
      
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>You are offline. Changes will be saved locally.</Text>
        </View>
      )}

      <PaperTextInput
        label="Name *"
        value={newCustomer.name}
        onChangeText={(text) => setNewCustomer({ ...newCustomer, name: text })}
        style={styles.input}
        mode="outlined"
        disabled={loading}
      />

      <PaperTextInput
        label="Email"
        value={newCustomer.email}
        onChangeText={(text) => setNewCustomer({ ...newCustomer, email: text })}
        style={styles.input}
        mode="outlined"
        keyboardType="email-address"
        disabled={loading}
      />

      <PaperTextInput
        label="Phone"
        value={newCustomer.phone}
        onChangeText={(text) =>
          setNewCustomer({ ...newCustomer, phone: text.replace(/[^0-9]/g, "") })
        }
        style={styles.input}
        mode="outlined"
        keyboardType="phone-pad"
        disabled={loading}
      />

      <PaperTextInput
        label="Balance"
        value={newCustomer.balance}
        onChangeText={(text) =>
          setNewCustomer({ ...newCustomer, balance: text.replace(/[^0-9]/g, "") })
        }
        style={styles.input}
        mode="outlined"
        keyboardType="numeric"
        disabled={loading}
      />

      <TouchableOpacity
        onPress={() => setCustomerDatePickerVisible(true)}
        style={styles.dateButton}
        disabled={loading}
      >
        <Text style={styles.dateButtonText}>
          {customerDate ? customerDate.toLocaleDateString() : "Select Date"}
        </Text>
      </TouchableOpacity>

      {customerDate && (
        <TouchableOpacity
          onPress={() => setCustomerDate(null)}
          style={styles.clearButton}
          disabled={loading}
        >
          <Text style={styles.clearButtonText}>Clear Date</Text>
        </TouchableOpacity>
      )}

      <Button
        mode="contained"
        onPress={handleSaveCustomer}
        style={styles.saveButton}
        loading={loading}
        disabled={loading}
      >
        {existingCustomerId ? "Update Customer" : "Save Customer"}
      </Button>

      <DatePickerModal
        mode="single"
        visible={customerDatePickerVisible}
        onDismiss={() => setCustomerDatePickerVisible(false)}
        date={customerDate || new Date()}
        locale="en"
        onConfirm={({ date }) => {
          if (date instanceof Date) {
            setCustomerDate(date);
            setCustomerDatePickerVisible(false);
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#121212" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center" , color:'#fff'},
  input: { marginVertical: 8, backgroundColor: "#fff" },
  dateButton: {
    backgroundColor: "#006A6A",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 8,
    alignItems: "center",
  },
  dateButtonText: { color: "white", fontWeight: "bold" },
  clearButton: {
    backgroundColor: "#e74c3c",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 4,
    alignItems: "center",
  },
  clearButtonText: { color: "white", fontWeight: "bold" },
  saveButton: { marginTop: 20 ,     backgroundColor: "#006A6A",
},
  offlineBanner: {
    backgroundColor: "#f39c12",
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  offlineText: {
    color: "white",
    textAlign: "center",
    fontWeight: "bold",
  }
});

export default AddCustomerScreen;