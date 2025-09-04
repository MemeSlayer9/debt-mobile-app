import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
 import CheckBox from 'expo-checkbox';

const LoginScreen = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const handleLogin = () => {
    // Handle login logic here
    console.log("Logging in with:", { username, password, rememberMe });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log In</Text>
      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity>
        <Text style={styles.forgotPassword}>Forgot Password?</Text>
      </TouchableOpacity>
      <View style={styles.rememberMeContainer}>
          <CheckBox
          value={rememberMe}
          onValueChange={setRememberMe}
        />
        <Text style={styles.rememberMeText}>Remember Me</Text>
      </View>
      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Log In</Text>
      </TouchableOpacity>
      <Text style={styles.footerText}>
        Don’t have an account? <Text style={styles.signUpText}>Sign Up</Text>
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
  },
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#006A6A",
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 15,
  },
  forgotPassword: {
    alignSelf: "flex-start",
    color: "#006A6A",
    marginBottom: 10,
  },
  rememberMeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  rememberMeText: {
    marginLeft: 8,
  },
  button: {
    backgroundColor: "#006A6A",
    width: "100%",
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  footerText: {
    marginTop: 15,
    fontSize: 14,
  },
  signUpText: {
    color: "#F39C12",
    fontWeight: "bold",
  },
});

export default LoginScreen;
