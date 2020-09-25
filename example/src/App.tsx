import React, { Component } from "react";
import PropTypes from "prop-types";
import { Scatter } from "ual-scatter";
import { Anchor } from "ual-anchor";
import { UALProvider, withUAL, UALProps } from "ual-reactjs-renderer";
import { enhanceUAL } from "ual-cosign";

const styles = {
  container: {
    display: "flex",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    flexDirection: "column",
  },
  button: {
    padding: "10px 60px",
    backgroundColor: "#EA2E2E",
    textAlign: "center",
    borderRadius: 5,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  logout: {
    marginTop: 20,
  },
  baseText: {
    color: "#fff",
    fontSize: 18,
  },
  blueBG: {
    backgroundColor: "#447DD8",
  },
  announcementBar: {
    width: "100%",
    padding: "10px 50px 10px 20px",
    textAlign: "center",
    backgroundColor: "#3de13d",
    top: 0,
    position: "absolute",
    alignItems: "center",
  },
} as any;

const receiver = `not.exists`;
const getTransaction = (account: string) => ({
  actions: [
    {
      account: "eosio.token",
      name: "transfer",
      authorization: [{ actor: account, permission: "active" }],
      data: { from: account, to: receiver, quantity: "0.0001 EOS", memo: "" },
    },
  ],
});

class TestApp extends Component<UALProps> {
  state = { message: "" };

  transfer = async () => {
    const {
      ual: { activeUser },
    } = this.props;
    try {
      const accountName = await activeUser.getAccountName();
      const demoTransaction = getTransaction(accountName);
      const result = await activeUser.signTransaction(demoTransaction, {
        expireSeconds: 60,
        blocksBehind: 3,
      });
      this.setState({ message: `Transfer Successful!` }, () => {
        setTimeout(this.resetMessage, 5000);
      });
      console.info("SUCCESS:", result);
    } catch (e) {
      console.error("ERROR:", e);
    }
  };

  changeRpc = async () => {
    const { ual } = this.props;
    console.log(ual)
    const enhancedUAL = enhanceUAL(ual)
    console.log(enhancedUAL)
    enhancedUAL.changeRpcEndpoint(`https://api.main.alohaeos.com`)
  }

  getName = () => {
    const { ual } = this.props;
    return ual.activeUser ? ual.activeUser.accountName : ``;
  }

  resetMessage = () => this.setState({ message: "" });

  renderLoggedInView = () => (
    <>
      <strong>{this.getName()}</strong>
      {this.state.message ? (
        <div style={styles.announcementBar}>
          <p style={styles.baseText}>{this.state.message}</p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={this.transfer}
        style={{ ...styles.button, ...styles.blueBG }}
      >
        <p style={styles.baseText}>{`Transfer 1 EOS`}</p>
      </button>
      <button
        type="button"
        onClick={this.props.ual.logout}
        style={styles.logout}
      >
        <p>Logout</p>
      </button>
      <button
        type="button"
        onClick={this.changeRpc}
      >
        <p>Change RPC</p>
      </button>
    </>
  );

  renderLoginButton = () => (
    <button
      type="button"
      onClick={this.props.ual.showModal}
      style={styles.button}
    >
      <p style={{ ...styles.buttonText, ...styles.baseText }}>LOGIN</p>
    </button>
  );

  render() {
    const {
      ual: { activeAuthenticator },
    } = this.props;
    return (
      <div style={styles.container}>
        {activeAuthenticator
          ? this.renderLoggedInView()
          : this.renderLoginButton()}
      </div>
    );
  }
}

const chainId = `aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906`;
const rpcEndpoints = [
  {
    protocol: `https`,
    host: `eos.eosn.io`,
    port: 443,
  },
];
const exampleNet = { chainId, rpcEndpoints };
const TestAppConsumer = withUAL(TestApp);
const scatter = new Scatter([exampleNet], { appName: `MyApp` });
const anchor = new Anchor([exampleNet], { appName: `MyApp` });

const App = () => (
  <UALProvider
    chains={[exampleNet]}
    authenticators={[scatter, anchor]}
    appName="Authenticator Test App"
  >
    <TestAppConsumer />
  </UALProvider>
);

export default App;
