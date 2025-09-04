import React, { useState } from "react";
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator
} from "react-native";
import CheckBox from "expo-checkbox";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { supabase } from '../supabase/supabaseClient';
import { RootStackParamList } from "../navigation/navigationTypes";
import { useUser } from "../context/UserContext"; // adjust the path as needed

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "Login">;
};

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setUser } = useUser();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Email and password are required.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoading(false);
        if (error.message.includes("Email not confirmed")) {
          Alert.alert(
            "Email Not Confirmed",
            "Please check your email for a confirmation link or resend it below."
          );
          return;
        }
        throw error;
      }

      const user = data.user;
      if (!user) {
        setLoading(false);
        Alert.alert("Error", "Login failed.");
        return;
      }

      // Fetch user profile with image
      const { data: profile, error: profileError } = await supabase
        .from("profile")
        .select("username, profile_image")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setLoading(false);
        console.error("Profile Fetch Error:", profileError);
        Alert.alert("Error", "Failed to fetch user profile.");
        return;
      }

      if (!profile?.username) {
        setLoading(false);
        Alert.alert("Error", "Username not found.");
        return;
      }

      // Set the user context with username and profile image
      setUser({
        username: profile.username,
        profileImage: profile.profile_image,
      });

      navigation.navigate("MainTabs", { 
        username: profile.username,
        profileImage: profile.profile_image 
      });


    } catch (error: any) {
      setLoading(false);
      console.error("Login Error:", error);
      Alert.alert("Login Error", error.message);
    } finally {
      setLoading(false);
    }
  };


  const resendConfirmationEmail = async () => {
    if (!email) {
      Alert.alert("Error", "Please enter your email first.");
      return;
    }

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (error) throw error;
      Alert.alert("Success", "A confirmation email has been sent.");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

    const handleResetPassword = () => {
      if (!email) {
        Alert.alert("Error", "Please enter your email first.");
        return;
      }
      navigation.navigate("ForgotPassword", { email });
    };
  

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log In</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity onPress={handleResetPassword}>
        <Text style={styles.forgotPassword}>Forgot Password?</Text>
      </TouchableOpacity>

      <View style={styles.rememberMeContainer}>
        <CheckBox
          value={rememberMe}
          onValueChange={setRememberMe}
          color={rememberMe ? "#006A6A" : undefined}
        />
        <Text style={styles.rememberMeText}>Remember Me</Text>
      </View>

      <TouchableOpacity 
        style={styles.button} 
        onPress={handleLogin} 
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Log In</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={resendConfirmationEmail}>
        <Text style={styles.resendEmailText}>Resend Confirmation Email</Text>
      </TouchableOpacity>

      <Text style={styles.footerText}>
        Don’t have an account?{" "}
        <Text 
          style={styles.signUpText} 
          onPress={() => navigation.navigate("Register")}
        >
          Sign Up
        </Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#006A6A",
  },
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#006A6A",
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 15,
    fontSize: 16,
  },
  forgotPassword: {
    alignSelf: "flex-start",
    color: "#006A6A",
    marginBottom: 10,
    fontSize: 14,
  },
  rememberMeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    width: "100%",
  },
  rememberMeText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#444",
  },
  button: {
    backgroundColor: "#006A6A",
    width: "100%",
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    marginTop: 10,
    elevation: 2,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  resendEmailText: {
    color: "#006A6A",
    marginTop: 10,
    fontSize: 14,
    textDecorationLine: "underline",
  },
  footerText: {
    marginTop: 15,
    fontSize: 14,
    color: "#444",
  },
  signUpText: {
    color: "#F39C12",
    fontWeight: "bold",
  },
});

export default LoginScreen;