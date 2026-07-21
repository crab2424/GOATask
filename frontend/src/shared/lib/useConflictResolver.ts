import { useDialogs } from "../components/DialogProvider";
import { ConflictError } from "../../api/client";

export type ConflictChoice = "overwrite" | "discard" | "cancel";

// 楽観ロック衝突時にユーザーに選択させるオリジナルUIのラッパ。
// DialogProviderのchoiceDialogを流用しつつ、キャンセルを "cancel" として明示的に区別する。
//
// 使い方:
//   const resolveConflict = useConflictResolver();
//   try {
//     await updateTask(id, form);
//   } catch (err) {
//     if (err instanceof ConflictError) {
//       const choice = await resolveConflict({ entityLabel: "タスク" });
//       if (choice === "overwrite") { await updateTask(id, form, { force: true }); }
//       else if (choice === "discard") { /* サーバー版はSSEで自動反映される */ }
//     } else { throw err; }
//   }
export function useConflictResolver() {
  const { choiceDialog } = useDialogs();

  return async function resolveConflict(opts: {
    /** 例: "タスク", "メモ" */
    entityLabel: string;
    /** 選択に添える補足文言。省略時は汎用メッセージ。 */
    message?: string;
  }): Promise<ConflictChoice> {
    const value = await choiceDialog({
      title: `別の端末で${opts.entityLabel}が更新されました`,
      message:
        opts.message ??
        "同じ" + opts.entityLabel + "を別の端末が編集していました。どうしますか？\n" +
        "・自分の内容で上書きする → 相手の変更は失われます\n" +
        "・相手の内容に合わせる → 今開いている編集は破棄され、最新に更新されます",
      options: [
        { value: "overwrite", label: "自分の内容で上書きする" },
        { value: "discard", label: "相手の内容に合わせる（編集を破棄）" },
      ],
      cancelLabel: "あとで決める",
    });
    if (value === "overwrite" || value === "discard") return value;
    return "cancel";
  };
}

// ConflictErrorかどうかを判定する薄いヘルパ。呼び出し側の分岐を短くするだけ。
export function isConflictError(err: unknown): err is ConflictError {
  return err instanceof ConflictError;
}
