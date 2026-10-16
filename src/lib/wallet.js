// «Monedero propio verificado» (connections.wallet_ok). GoHighLevel cobra los cargos de una app al monedero de la
// AGENCIA salvo que la app se revenda y la subcuenta tenga la refacturación activa con tarjeta; en ese caso los
// cobra al monedero de la subcuenta. Como desde la API no se puede saber cuál de los dos pagará, el marketplace
// solo cobra del monedero de GHL en las subcuentas que el administrador ha verificado. En el resto, todo se paga
// con el crédito ya recargado y la agencia nunca paga por un cliente.

export const WALLET_OFF_CODE = 'WALLET_NOT_ENABLED'

export const WALLET_OFF_MSG =
  'El pago con el monedero de GoHighLevel no está activado para esta subcuenta: se paga solo con el saldo del marketplace'

export const TOPUP_OFF_MSG =
  'Tu agencia aún no ha activado la recarga desde tu monedero de GoHighLevel en esta subcuenta. Pídeselo y podrás recargar.'

export const walletEnabled = (conn) => conn?.wallet_ok === true
