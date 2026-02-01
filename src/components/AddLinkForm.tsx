import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";

type AddLinkFormProps = {
  onCreate: (title: string, url: string) => Promise<boolean>;
};

export default function AddLinkForm({ onCreate }: AddLinkFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Link"
            onSubmit={async (values) => {
              const title = (values.title ?? "").trim();
              const url = (values.url ?? "").trim();
              if (!title || !url) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Title and URL are required",
                });
                return;
              }

              const created = await onCreate(title, url);
              if (created) {
                pop();
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        placeholder="e.g. GitHub"
        autoFocus
      />
      <Form.TextField id="url" title="URL" placeholder="https://…" />
    </Form>
  );
}
