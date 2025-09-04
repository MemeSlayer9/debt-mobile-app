import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useCurrency } from '../context/CurrencyContext';
import { RootStackParamList } from '../navigation/navigationTypes'; // Adjust the path as needed

type CurrencyDropdownNavigationProp = StackNavigationProp<
  RootStackParamList,
  'Currency'
>;

const currencies = [
  { name: "United States Dollar", symbol: "$", flag: "🇺🇸" },
  { name: "Euro", symbol: "€", flag: "🇪🇺" },
  { name: "British Pound Sterling", symbol: "£", flag: "🇬🇧" },
  { name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
  { name: "Australian Dollar", symbol: "$", flag: "🇦🇺" },
  { name: "Canadian Dollar", symbol: "$", flag: "🇨🇦" },
  { name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭" },
  { name: "Chinese Yuan", symbol: "¥", flag: "🇨🇳" },
  { name: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  { name: "Russian Ruble", symbol: "₽", flag: "🇷🇺" },
  { name: "Brazilian Real", symbol: "R$", flag: "🇧🇷" },
  { name: "South African Rand", symbol: "R", flag: "🇿🇦" },
  { name: "Mexican Peso", symbol: "$", flag: "🇲🇽" },
  { name: "Singapore Dollar", symbol: "SGD", flag: "🇸🇬" },
  { name: "New Zealand Dollar", symbol: "$", flag: "🇳🇿" },
  { name: "Hong Kong Dollar", symbol: "HK$", flag: "🇭🇰" },
  { name: "Philippine Peso", symbol: "₱", flag: "🇵🇭" },
  { name: "Thai Baht", symbol: "฿", flag: "🇹🇭" },
  { name: "South Korean Won", symbol: "₩", flag: "🇰🇷" },
  { name: "Turkish Lira", symbol: "₺", flag: "🇹🇷" },
  { name: "Emirati Dirham", symbol: "₻", flag: "🇦🇪" },
  { name: "Argentinian Peso", symbol: "$", flag: "🇦🇷" },
  { name: "Chilean Peso", symbol: "$", flag: "🇨🇱" },
  { name: "Colombian Peso", symbol: "$", flag: "🇨🇴" },
  { name: "Czech Koruna", symbol: "Kč", flag: "🇨🇿" },
  { name: "Danish Krone", symbol: "kr", flag: "🇩🇰" },
  { name: "Egyptian Pound", symbol: "E£", flag: "🇪🇬" },
  { name: "Hungarian Forint", symbol: "Ft", flag: "🇭🇺" },
  { name: "Indonesian Rupiah", symbol: "Rp", flag: "🇮🇩" },
  { name: "Israeli Shekel", symbol: "₪", flag: "🇮🇱" },
  { name: "Kazakhstani Tenge", symbol: "₸", flag: "🇰🇿" },
  { name: "Malaysian Ringgit", symbol: "RM", flag: "🇲🇾" },
  { name: "Moroccan Dirham", symbol: "د.م", flag: "🇲🇦" },
  { name: "Norwegian Krone", symbol: "kr", flag: "🇳🇴" },
  { name: "Peruvian Sol", symbol: "S/.", flag: "🇵🇪" },
  { name: "Polish Zloty", symbol: "zł", flag: "🇵🇱" },
  { name: "Romanian Leu", symbol: "₯", flag: "🇷🇴" },
  { name: "Saudi Riyal", symbol: "﷼", flag: "🇸🇦" },
  { name: "Swedish Krona", symbol: "kr", flag: "🇸🇪" },
  { name: "Ukrainian Hryvnia", symbol: "₴", flag: "🇺🇦" },
  { name: "Vietnamese Dong", symbol: "₫", flag: "🇻🇳" },
];

const currencyData = currencies.map((currency) => ({
  label: `${currency.flag} ${currency.name} (${currency.symbol})`,
  value: currency.symbol,
  name: currency.name,
  flag: currency.flag
}));

const CurrencyDropdown = () => {
  const { currency, currencyName, currencyFlag, setCurrency, isLoading } = useCurrency();
  const navigation = useNavigation<CurrencyDropdownNavigationProp>();
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [currentItem, setCurrentItem] = useState<any>(null);

  // Update the selected value when currency loads from storage
  useEffect(() => {
    if (!isLoading && currency) {
      setSelectedValue(currency);
      
      // Find the matching currency item
      const matchingCurrency = currencyData.find(item => item.value === currency);
      if (matchingCurrency) {
        setCurrentItem(matchingCurrency);
      }
    }
  }, [isLoading, currency]);

  // Check if a currency is already selected and navigate accordingly
  useEffect(() => {
    if (!isLoading && currency && currencyName && currencyFlag) {
      // If currency data is already present and we're on the selection screen,
      // we can automatically navigate to the next screen
      // Uncomment the next line if you want automatic navigation
      // navigation.navigate("Login");
    }
  }, [isLoading, currency, navigation]);

  const handleDropdownChange = (item: any) => {
    setCurrentItem(item);
    setSelectedValue(item.value);
  };

  const handleSubmit = () => {
    if (currentItem) {
      // Pass all currency information to the context
      setCurrency(currentItem.value, currentItem.name, currentItem.flag);
      // Navigate to the Login screen after currency selection
      navigation.navigate("Login");
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Loading currency preferences...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Currency</Text>
      <Dropdown
        style={styles.dropdown}
        data={currencyData}
        labelField="label"
        valueField="value"
        placeholder="Select Currency"
        value={selectedValue}
        onChange={handleDropdownChange}
        placeholderStyle={styles.placeholderStyle}
        selectedTextStyle={styles.selectedTextStyle}
      />
      <TouchableOpacity 
        style={[
          styles.button,
          !currentItem && styles.buttonDisabled
        ]} 
        onPress={handleSubmit}
        disabled={!currentItem}
      >
        <Text style={styles.buttonText}>
          {currency ? 'Update Selection' : 'Confirm Selection'}
        </Text>
      </TouchableOpacity>
      {currency ? (
        <Text style={styles.selectedText}>
          Current Currency: {currencyFlag} {currencyName} ({currency})
        </Text>
      ) : (
        <Text style={styles.selectedText}>
          Please select a currency
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: "#0E1114",
  },
  title: {
    fontSize: 20,
    marginBottom: 8,
    color: "#ffff", // Title text color white
  },
  dropdown: {
    width: '100%',
    height: 50,
    borderColor: 'gray',
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  placeholderStyle: {
    color: '#ffff',
  },
  selectedTextStyle: {
    color: '#ffff',
  },
  selectedText: {
    fontSize: 16,
    color: '#ffff',
    marginTop: 8,
  },
  button: {
    backgroundColor: "#2e9369",
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#3498db77', // Semi-transparent to indicate disabled state
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ffff',
  }
});

export default CurrencyDropdown;