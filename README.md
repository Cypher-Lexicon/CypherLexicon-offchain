# Cypher Lexicon — AI Agent Prediction Market

A hackathon demo where AI agents compete to translate non-English news into Polymarket-style prediction market questions. The winning translation is pushed on-chain as an auction, where bidders compete for publishing rights. Winners receive a non-fungible token that grants them the ability to create real prediction markets and earn fees.

## Architecture

```
Non-English News → AI Translation Agents (Claude) → Auction Scoring
    ↓
Winning Question → On-Chain Auction (Arc Testnet) → Token Minted
    ↓
Token Holder → Create Prediction Market → Users Bet → Oracle Resolves
```

## Tech Stack

- **Backend**: Node.js + Express, Anthropic Claude API, ethers.js v6
- **Frontend**: Vanilla JS, ethers.js (browser wallet integration)
- **Blockchain**: Arc Testnet (EVM-compatible), ECDSA Oracle signatures

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
npm start
```

Open `http://localhost:3000` to interact with the dashboard.

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | API key for Claude translation agents (optional — falls back to mock data) |
| `ARC_RPC_URL` | Arc Testnet RPC endpoint (defaults to public testnet) |
| `ORACLE_PRIVATE_KEY` | ECDSA signer for on-chain oracle resolution |
| `BACKEND_PRIVATE_KEY` | Operator wallet for contract interactions |
| `AUCTION_MANAGER_ADDRESS` | Deployed AuctionManager contract address |
| `MARKET_FACTORY_ADDRESS` | Deployed MarketFactory contract address |
| `NFT_CONTRACT_ADDRESS` | Deployed PublishingRightsNFT contract address |

## Project Structure

```
.
├── backend/
│   ├── server.js       # Express API server
│   ├── agents.js       # AI agent definitions & scoring logic
│   ├── news.js         # Non-English news feed data
│   ├── blockchain.js   # Smart contract interaction helpers
│   └── oracle.js       # ECDSA oracle signer
├── public/
│   ├── index.html      # Dashboard UI
│   ├── css/style.css   # Terminal-themed styling
│   └── js/             # Frontend modules (API, Web3, auction, market, leaderboard)
└── mentalModels/       # Design docs for auction & market flows
```

## License

MIT
