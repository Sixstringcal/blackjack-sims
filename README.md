# Blackjack Sims

Small static Blackjack simulator intended for GitHub Pages. Open `index.html` in a browser or deploy to GitHub Pages. The app runs many simulations in a Web Worker.

Usage
- Open `index.html` in a modern browser.
- Configure parameters (no negative values allowed).
- Click Start Simulation. Results are printed as JSON.

Deployment
- Push the repo to GitHub and enable GitHub Pages from the repository settings (deploy from `main` branch root).

Notes
- This is a compact simulation engine with conservative simplifications (basic strategy is simplified). It supports Hi-Lo counting, several betting systems, payout differences (3:2 vs 6:5), penetration, and stop-loss.
- Includes Triple Martingale (triple after each loss) as a provided betting option.
- For production-grade accuracy, expand the strategy tables, handle splits/doubles/insurance, and add more counting systems.
