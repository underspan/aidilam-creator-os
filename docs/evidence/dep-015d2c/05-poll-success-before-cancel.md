# DEP-015D2C Poll Success Before Cancel

## Mechanism
- If pollStatus returns succeeded before cancel_requested check
- settleSuccess commits with FOR UPDATE → success is terminal
- Cancel arrives: 409 "already terminal"
- Proven in D2A (cancel-fail/cancel-timeout jobs polled to success → cancel=409)
