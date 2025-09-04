import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Keys for AsyncStorage
const CURRENCY_SYMBOL_KEY = '@currency_symbol';
const CURRENCY_NAME_KEY = '@currency_name';
const CURRENCY_FLAG_KEY = '@currency_flag';

interface CurrencyContextProps {
  currency: string;
  currencyName: string;
  currencyFlag: string;
  setCurrency: (currency: string, name?: string, flag?: string) => void;
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextProps | undefined>(undefined);

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
};

interface CurrencyProviderProps {
  children: ReactNode;
}

export const CurrencyProvider: React.FC<CurrencyProviderProps> = ({ children }) => {
  // State with initial empty values
  const [currency, setCurrencyValue] = useState<string>("");
  const [currencyName, setCurrencyName] = useState<string>("");
  const [currencyFlag, setCurrencyFlag] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Load saved currency data when component mounts
  useEffect(() => {
    const loadCurrency = async () => {
      try {
        const storedSymbol = await AsyncStorage.getItem(CURRENCY_SYMBOL_KEY);
        const storedName = await AsyncStorage.getItem(CURRENCY_NAME_KEY);
        const storedFlag = await AsyncStorage.getItem(CURRENCY_FLAG_KEY);
        
        if (storedSymbol) setCurrencyValue(storedSymbol);
        if (storedName) setCurrencyName(storedName);
        if (storedFlag) setCurrencyFlag(storedFlag);
      } catch (error) {
        console.error('Failed to load currency data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadCurrency();
  }, []);

  // Enhanced setCurrency function that stores values in AsyncStorage
  const setCurrency = async (symbol: string, name: string = "", flag: string = "") => {
    try {
      // Update state
      setCurrencyValue(symbol);
      setCurrencyName(name);
      setCurrencyFlag(flag);
      
      // Save to AsyncStorage
      await AsyncStorage.setItem(CURRENCY_SYMBOL_KEY, symbol);
      await AsyncStorage.setItem(CURRENCY_NAME_KEY, name);
      await AsyncStorage.setItem(CURRENCY_FLAG_KEY, flag);
    } catch (error) {
      console.error('Failed to save currency data:', error);
    }
  };

  return (
    <CurrencyContext.Provider value={{ 
      currency, 
      currencyName,
      currencyFlag, 
      setCurrency,
      isLoading
    }}>
      {children}
    </CurrencyContext.Provider>
  );
};