import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateContact } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Mail, MapPin, Phone, ArrowRight } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  service: z.string().min(1, "Please select a service"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

const servicesList = [
  "Website Development",
  "CRM Integration",
  "Sales Page Design",
  "Ecommerce Solutions",
  "Python Bot Automation",
  "Team Management",
  "Virtual Assistant",
  "Graphics & Branding",
  "Facebook Marketing",
  "Social Media Management",
  "Data Entry",
  "Lead Generation",
  "Other"
];

export default function Contact() {
  const { toast } = useToast();
  const contactMutation = useCreateContact();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      service: "",
      message: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    contactMutation.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({
            title: "Message sent successfully!",
            description: "We'll get back to you within 24 hours.",
          });
          form.reset();
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Something went wrong.",
            description: "Please try again or email us directly.",
          });
        }
      }
    );
  }

  return (
    <div className="pt-32 pb-24 min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Let's Work Together</h1>
            <p className="text-lg text-muted-foreground">Have a project in mind? Tell us about it and we'll help you bring it to life.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 bg-card rounded-3xl overflow-hidden border border-border/50 shadow-xl">
            
            {/* Contact Info Sidebar */}
            <div className="col-span-1 lg:col-span-2 bg-secondary p-8 md:p-12 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary to-transparent pointer-events-none" />
              
              <div className="relative z-10">
                <h3 className="text-2xl font-display font-bold mb-6">Contact Information</h3>
                <p className="text-muted-foreground mb-12">
                  Fill out the form and our team will get back to you within 24 hours.
                </p>

                <div className="space-y-8">
                  <div className="flex items-start gap-4 group">
                    <div className="w-12 h-12 rounded-full bg-background/50 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Mail className="text-primary w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-1">Email Us</h4>
                      <a href="mailto:hello@advantix.agency" className="text-lg hover:text-primary transition-colors">hello@advantix.agency</a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 group">
                    <div className="w-12 h-12 rounded-full bg-background/50 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Phone className="text-primary w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-1">Call Us</h4>
                      <a href="tel:+1234567890" className="text-lg hover:text-primary transition-colors">+1 (234) 567-890</a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 group">
                    <div className="w-12 h-12 rounded-full bg-background/50 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <MapPin className="text-primary w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-1">Location</h4>
                      <p className="text-lg">Global Remote Agency</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Container */}
            <div className="col-span-1 lg:col-span-3 p-8 md:p-12">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80">Full Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John Doe" className="bg-background/50 border-border h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80">Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john@example.com" className="bg-background/50 border-border h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80">Phone Number (Optional)</FormLabel>
                          <FormControl>
                            <Input type="tel" placeholder="+1 (555) 000-0000" className="bg-background/50 border-border h-12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="service"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground/80">Service of Interest</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-background/50 border-border h-12">
                                <SelectValue placeholder="Select a service" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {servicesList.map(service => (
                                <SelectItem key={service} value={service}>{service}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground/80">Your Message</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Tell us about your project goals..." 
                            className="resize-none min-h-[150px] bg-background/50 border-border" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    size="lg" 
                    className="w-full sm:w-auto h-14 px-8 text-base bg-primary hover:bg-primary/90 mt-4 group"
                    disabled={contactMutation.isPending}
                  >
                    {contactMutation.isPending ? "Sending..." : "Send Message"}
                    {!contactMutation.isPending && <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />}
                  </Button>
                </form>
              </Form>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
