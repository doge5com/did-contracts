const namehash = require('eth-ens-namehash')

export const getReverseNode = (addr: string) => {
  return namehash.hash(addr.slice(2).toLowerCase() + '.addr.reverse')
}
