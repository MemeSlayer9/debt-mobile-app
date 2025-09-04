 import React from "react";
import { View, Text, Button, Alert } from "react-native";
import { useUser } from "../context/UserContext";

const Logout = () => {
  const { user, logout } = useUser();

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      {user ? (
        <>
          <Text>Welcome {user.username}!</Text>
          <Button
            title="Logout"
            onPress={() => {
              Alert.alert(
                "Confirm Logout",
                "Are you sure you want to log out?",
                [
                  {
                    text: "Cancel",
                    style: "cancel",
                  },
                  {
                    text: "Logout",
                    onPress: logout,
                  },
                ]
              );
            }}
          />
        </>
      ) : (
        <Text>Not logged in</Text>
      )}
    </View>
  );
};

export default Logout;