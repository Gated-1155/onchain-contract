# BadgeToken — ERC-1155 배지 dApp (ethers + mocha 버전)

`../erc-1155`(viem + `node:test`)와 동일한 `BadgeToken` 컨트랙트를, **ethers.js + Mocha/Chai** 스택으로 그대로 옮겨 쓴 비교 프로젝트. 컨트랙트 로직(`contracts/BadgeToken.sol`)은 완전히 동일하고, 달라지는 건 테스트/스크립트가 체인과 상호작용하는 방식뿐이다.

> Notion 설계 문서·전송 경로 조사·실패 시나리오 문서는 원래 `../erc-1155` 작업 중 작성됐지만, onchain-contract가 메인이 된 이후로는 이 저장소 기준 내용(예: 실패 시나리오 A8, 배포 스크립트의 역할 분리 옵션 등)도 같은 문서에 계속 반영되고 있다.

## Polygon Amoy 배포 정보

- **컨트랙트 주소**: [`0xc85B40C6bD74EA71d3f08dBa316539D36DCedbCC`](https://amoy.polygonscan.com/address/0xc85B40C6bD74EA71d3f08dBa316539D36DCedbCC)
- **배포 스크립트**: `scripts/deploy.ts` (`npm run deploy:amoy`) — 배포 직후 A(id=1, 전송불가)/B(id=2, 전송불가)/C(id=3, 전송가능) 자동 등록까지 완료된 상태
- **생성자 인자**: `defaultAdmin`/`pauser`/`minter` 전부 배포자 본인 주소(`0x37a3Ed7De6C55C86bc6Bec6035e36885Ab405f80`)로 동일 설정
- **검증 상태**: Polygonscan에 "Source Code Verified / Exact Match"로 표시됨 (Sourcify 경유). Sourcify 리포지토리: https://sourcify.dev/server/repo-ui/80002/0xc85B40C6bD74EA71d3f08dBa316539D36DCedbCC
- **주의**: `scripts/deploy.ts`는 Ignition이 아니라 일반 스크립트라 재배포 시 새 주소가 생김(journal 없음).

## 프로젝트 구성

```
contracts/BadgeToken.sol             ERC-1155 배지 컨트랙트 (전송·승인 전면 차단, erc-1155와 동일)
contracts/test/MaliciousReceiver.sol 재진입 공격 재현용 테스트 전용 컨트랙트
test/BadgeToken.ts                   정상 동작 검증 (ethers + mocha + chai)
test/BadgeToken.failureScenarios.ts  실패 시나리오 재현 테스트
scripts/deploy.ts                    Amoy 배포 스크립트
scripts/check-amoy-network.ts        Amoy RPC 연결 확인
scripts/check-balance.ts             배포자 잔액 확인
scripts/estimate-deploy-gas.ts       배포/민팅 gas 비용 추정
```

## erc-1155(viem)와 다른 점 — 비교 포인트

| | erc-1155 | onchain-contract |
| --- | --- | --- |
| 체인 클라이언트 | viem | ethers.js v6 |
| 테스트 러너 | `node:test` | Mocha |
| 단언(assertion) | `viem.assertions.*` | chai (`expect(...).to.be.revertedWithCustomError(...)`) |
| write 호출 | `contract.write.fn([args], {account})` | `contract.connect(signer).fn(...args)` |
| read 호출 | `contract.read.fn([args])` | `contract.fn(...args)` |
| 이벤트/에러 인자 매칭 | 배열로 전체 비교 | `.withArgs(...)` 체이닝, 동적 값은 `anyValue` |

## 사용법

### 테스트

```shell
npm test          # 전체 (Solidity + TypeScript)
npm run test:ts    # TypeScript(mocha)만
npm run test:sol   # Solidity만
```

### 타입 체크

```shell
npm run typecheck
```

### Amoy 재배포

`.env`에 `AMOY_RPC_URL`, `PRIVATE_KEY` 필요. `BADGE_ADMIN_ADDRESS`/`BADGE_PAUSER_ADDRESS`/`BADGE_MINTER_ADDRESS`는 선택 사항 — 안 정하면 배포자 주소로 기본 설정됨.

```shell
npm run deploy:amoy
```

### Polygonscan/Sourcify 검증

```shell
npx hardhat verify --network amoy <주소> <defaultAdmin> <pauser> <minter>
```

## 재시작하면 어떻게 되나

**① 컨트랙트/블록체인 자체 — 해당 사항 없음.** "재시작"이라는 개념 자체가 성립하지 않습니다. 스마트 컨트랙트는 껐다 켤 수 있는 프로세스가 아니라 블록체인에 기록된 코드+상태이고, 그 상태(잔액, role, 배지 타입, `transferable` 플래그)는 우리 로컬 개발 환경이나 어떤 서버가 재시작되든 전혀 영향받지 않습니다. 이 프로젝트에는 개인키를 들고 있는 백엔드/릴레이어 서버가 없습니다 — 관리자 민팅은 관리자 본인의 지갑(MetaMask)이 wagmi를 통해 직접 서명하므로, "서버가 tx 서명 도중 죽었다"는 시나리오 자체가 존재하지 않습니다.

**② 배포 스크립트 — 재실행하면 새로 배포됩니다.** `scripts/deploy.ts`는 Hardhat Ignition이 아니라 일반 `hardhat run` 스크립트라, Ignition 같은 "이미 배포된 걸 기억하는 journal"이 없습니다. 배포 스크립트가 중간에 죽어서 재실행하면, 이전 시도가 이미 성공했었더라도 **컨트랙트가 또 배포되어 새 주소가 생깁니다** — Ignition과 달리 중복 배포를 스스로 막지 않습니다. 그래서 배포 후에는 반드시 이 README에 주소를 즉시 기록해서 "어느 배포가 진짜인지" 헷갈리지 않게 해야 합니다(참고: `ignition/` 디렉터리의 예시 모듈은 Hardhat 3 템플릿이 기본 제공한 것으로, 이 프로젝트의 실제 배포엔 사용하지 않음).

**③ 프론트엔드(브라우저) — 로컬 상태는 날아가지만, 승인 전이든 후든 트랜잭션 자체엔 영향이 없습니다.**
- **승인 전(서명 팝업 단계)**: 새로고침하면 그 요청 자체가 사라집니다. 아직 네트워크로 아무것도 전송되지 않은 상태라 잃을 게 없고, 다시 버튼을 눌러 처음부터 요청하면 됩니다.
- **승인 후(서명 완료, 브로드캐스트됨)**: 그 순간 트랜잭션은 브라우저와 완전히 독립적으로 체인에서 처리됩니다 — 새로고침하든 탭을 닫든, 트랜잭션의 성공/실패 여부에는 전혀 영향을 주지 않습니다. 다만 그 결과를 보여주던 로컬 "대기 중" UI 상태는 사라지므로, 페이지를 다시 열었을 때 로컬 상태에 의존하지 말고 **지갑 주소 기준으로 배지 잔액을 다시 조회**해서 실제로 민팅이 확정됐는지/실패했는지를 재확인하는 방식으로 설계해야 합니다.